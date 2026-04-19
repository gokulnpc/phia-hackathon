import "./content.css";
import { detectProductWithCatalogRules } from "./detection";

/** Must stay in sync with `src/lib/mirrorOverlayMessages.ts`. Inlined so the content bundle avoids fragile cross-chunk imports. */
const MIRROR_CLOSE_OVERLAY_MESSAGE_TYPE = "mirror:closeOverlay" as const;

/**
 * Per-tab dismiss for the entry chip (`window.sessionStorage`, not `chrome.storage.session`).
 * Extension session storage is shared across tabs, which incorrectly hid the chip on new tabs after dismiss.
 */
const MIRROR_CHIP_DISMISS_TAB_KEY = "mirror:entryChipDismissed" as const;

/** Per-tab saved pixel position for the entry chip host (`#mirror-host`). */
const MIRROR_CHIP_POSITION_TAB_KEY = "mirror:entryChipPosition" as const;

const CHIP_VIEWPORT_MARGIN_PX = 8;

/** Movement past this (px) from pointerdown suppresses the chip click-to-open. */
const CHIP_DRAG_THRESHOLD_PX = 6;

/** Legacy extension-wide key — cleared on init so stuck tabs recover after the fix. */
const MIRROR_CHIP_DISMISSED_LEGACY_CHROME_KEY = "mirrorChipDismissed" as const;

function isMirrorEntryChipDismissedInTab(): boolean {
  try {
    return (
      globalThis.sessionStorage?.getItem(MIRROR_CHIP_DISMISS_TAB_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function setMirrorEntryChipDismissedInTab(): void {
  try {
    globalThis.sessionStorage?.setItem(MIRROR_CHIP_DISMISS_TAB_KEY, "1");
  } catch {
    /* ignore (e.g. blocked storage) */
  }
}

function clearMirrorEntryChipDismissedInTab(): void {
  try {
    globalThis.sessionStorage?.removeItem(MIRROR_CHIP_DISMISS_TAB_KEY);
  } catch {
    /* ignore */
  }
}

type EntryChipPosition = { left: number; top: number };

function readEntryChipPositionFromTab(): EntryChipPosition | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(MIRROR_CHIP_POSITION_TAB_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("left" in parsed) ||
      !("top" in parsed)
    ) {
      return null;
    }
    const rec = parsed as { left: unknown; top: unknown };
    if (typeof rec.left !== "number" || typeof rec.top !== "number") {
      return null;
    }
    if (!Number.isFinite(rec.left) || !Number.isFinite(rec.top)) {
      return null;
    }
    return { left: rec.left, top: rec.top };
  } catch {
    return null;
  }
}

function writeEntryChipPositionToTab(left: number, top: number): void {
  try {
    globalThis.sessionStorage?.setItem(
      MIRROR_CHIP_POSITION_TAB_KEY,
      JSON.stringify({ left, top }),
    );
  } catch {
    /* ignore */
  }
}

function mirrorHostUsesPixelPosition(host: HTMLElement): boolean {
  return Boolean(host.style.left && host.style.top);
}

function clampMirrorHostToViewport(
  host: HTMLElement,
  left: number,
  top: number,
): EntryChipPosition {
  const rect = host.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const minLeft = CHIP_VIEWPORT_MARGIN_PX;
  const minTop = CHIP_VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(
    minLeft,
    globalThis.window.innerWidth - w - CHIP_VIEWPORT_MARGIN_PX,
  );
  const maxTop = Math.max(
    minTop,
    globalThis.window.innerHeight - h - CHIP_VIEWPORT_MARGIN_PX,
  );
  return {
    left: Math.min(Math.max(left, minLeft), maxLeft),
    top: Math.min(Math.max(top, minTop), maxTop),
  };
}

/** `left` / `top` must already be viewport-clamped (e.g. from `clampMirrorHostToViewport`). */
function snapMirrorHostHorizontalAfterClamp(
  left: number,
  top: number,
  width: number,
): EntryChipPosition {
  const minLeft = CHIP_VIEWPORT_MARGIN_PX;
  const maxLeft = Math.max(
    minLeft,
    globalThis.window.innerWidth - width - CHIP_VIEWPORT_MARGIN_PX,
  );
  const centerX = left + width / 2;
  const snappedLeft =
    centerX <= globalThis.window.innerWidth / 2 ? minLeft : maxLeft;
  return { left: snappedLeft, top };
}

function clampThenSnapMirrorHostToViewport(
  host: HTMLElement,
  left: number,
  top: number,
): EntryChipPosition {
  const c = clampMirrorHostToViewport(host, left, top);
  const w = host.getBoundingClientRect().width;
  return snapMirrorHostHorizontalAfterClamp(c.left, c.top, w);
}

function applyMirrorHostPositionPxSnapped(
  host: HTMLElement,
  left: number,
  top: number,
): EntryChipPosition {
  const s = clampThenSnapMirrorHostToViewport(host, left, top);
  applyMirrorHostPositionPx(host, s.left, s.top);
  return s;
}

function applyMirrorHostPositionPx(
  host: HTMLElement,
  left: number,
  top: number,
): void {
  const c = clampMirrorHostToViewport(host, left, top);
  host.style.cssText = [
    "position:fixed",
    `left:${c.left}px`,
    `top:${c.top}px`,
    "right:auto",
    "bottom:auto",
    "transform:none",
    "z-index:2147483646",
  ].join(";");
}

function applyMirrorHostDefaultPosition(host: HTMLElement): void {
  host.style.cssText = [
    "position:fixed",
    "top:42%",
    "right:3px",
    "transform:translateY(-50%)",
    "z-index:2147483646",
  ].join(";");
}

function reclampMirrorHostIfNeeded(): void {
  const host = document.getElementById("mirror-host");
  if (!host || !mirrorHostUsesPixelPosition(host)) {
    return;
  }
  const rect = host.getBoundingClientRect();
  const s = clampThenSnapMirrorHostToViewport(host, rect.left, rect.top);
  if (s.left !== rect.left || s.top !== rect.top) {
    applyMirrorHostPositionPx(host, s.left, s.top);
    writeEntryChipPositionToTab(s.left, s.top);
  }
}

/** Set true to restore the legacy bottom-right “Try It On ✨” pill. */
const SHOW_LEGACY_TRY_ON = false;

let mirrorHostResizeListenerAttached = false;

/** Side panel asks the active tab to run detection without opening the overlay (MV3 async response). */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "mirror:runDetection") {
    return false;
  }
  void detectProductWithCatalogRules()
    .then((payload) => chrome.storage.session.set({ mirrorProduct: payload }))
    .then(() => {
      sendResponse({ ok: true as const });
    })
    .catch((e: unknown) => {
      sendResponse({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  return true;
});

let overlayIframe: HTMLIFrameElement | null = null;
let overlayBackdrop: HTMLDivElement | null = null;
let overlayIsClosing = false;

function prefersOverlayMotionReduced(): boolean {
  return Boolean(
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
}

function rAF2(fn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}

const OVERLAY_IFRAME_BASE_STYLE = [
  "position:fixed",
  "top:6px",
  "right:6px",
  "width:min(400px,calc(100vw - 12px))",
  "max-width:calc(100vw - 12px)",
  "height:min(90dvh,880px)",
  "border:none",
  "z-index:2147483647",
  "border-radius:24px",
  "box-shadow:0 12px 48px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.08)",
  "background:#f2f2f2",
].join(";");

function tearDownOverlayDom(): void {
  overlayIframe?.remove();
  overlayBackdrop?.remove();
  overlayIframe = null;
  overlayBackdrop = null;
}

function removeOverlay(): void {
  if (overlayIsClosing) {
    return;
  }
  if (!overlayIframe && !overlayBackdrop) {
    return;
  }
  if (prefersOverlayMotionReduced()) {
    tearDownOverlayDom();
    return;
  }
  const iframe = overlayIframe;
  const backdrop = overlayBackdrop;
  if (!iframe) {
    tearDownOverlayDom();
    return;
  }

  overlayIsClosing = true;
  const finish = (): void => {
    iframe.removeEventListener("transitionend", onEnd);
    clearTimeout(backupTimer);
    overlayIsClosing = false;
    tearDownOverlayDom();
  };
  const onEnd = (ev: TransitionEvent): void => {
    if (ev.target !== iframe) return;
    if (ev.propertyName !== "transform") return;
    finish();
  };
  iframe.addEventListener("transitionend", onEnd);
  const backupTimer = setTimeout(finish, 400);

  iframe.style.transition = "transform 280ms cubic-bezier(0.22,1,0.36,1)";
  iframe.style.transform = "translateX(100%)";
  if (backdrop) {
    backdrop.style.transition = "opacity 200ms ease";
    backdrop.style.opacity = "0";
  }
}

function ensureOverlayIframe(): void {
  const overlayUrl = chrome.runtime.getURL("overlay.html");
  const motionOk = !prefersOverlayMotionReduced();

  if (!overlayBackdrop) {
    const backdrop = document.createElement("div");
    backdrop.id = "mirror-overlay-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    const backdropBase = [
      "position:fixed",
      "inset:0",
      "z-index:2147483645",
      "background:rgba(15,23,42,0.38)",
      "pointer-events:none",
    ];
    if (motionOk) {
      backdropBase.push("opacity:0", "transition:opacity 200ms ease");
    }
    backdrop.style.cssText = backdropBase.join(";");
    document.body.appendChild(backdrop);
    overlayBackdrop = backdrop;
  }

  if (!overlayIframe) {
    const iframe = document.createElement("iframe");
    iframe.id = "mirror-overlay-frame";
    iframe.setAttribute("title", "Mirror");
    iframe.allow = "clipboard-read; clipboard-write";
    if (motionOk) {
      iframe.style.cssText = [
        OVERLAY_IFRAME_BASE_STYLE,
        "will-change:transform",
        "transform:translateX(100%)",
        "transition:transform 280ms cubic-bezier(0.22,1,0.36,1)",
      ].join(";");
    } else {
      iframe.style.cssText = OVERLAY_IFRAME_BASE_STYLE;
    }
    iframe.src = overlayUrl;
    document.body.appendChild(iframe);
    overlayIframe = iframe;
    if (motionOk && overlayBackdrop) {
      rAF2(() => {
        if (!overlayIframe || overlayIframe !== iframe) return;
        iframe.style.transform = "translateX(0)";
        overlayBackdrop!.style.opacity = "1";
      });
    }
  } else {
    // Iframe already mounted: refresh only (no enter animation on repeat open in same session).
    overlayIframe.src = overlayUrl;
  }
}

function onOverlayMessage(event: MessageEvent): void {
  if (event.data?.type !== MIRROR_CLOSE_OVERLAY_MESSAGE_TYPE) return;
  const extOrigin = `chrome-extension://${chrome.runtime.id}`;
  if (event.origin !== extOrigin) return;
  if (!overlayIframe || event.source !== overlayIframe.contentWindow) return;
  removeOverlay();
}

window.addEventListener("message", onOverlayMessage);

function mountShadowEntry(): void {
  if (document.getElementById("mirror-host")) {
    return;
  }
  if (!document.body) {
    return;
  }
  const host = document.createElement("div");
  host.id = "mirror-host";
  applyMirrorHostDefaultPosition(host);
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });

  if (SHOW_LEGACY_TRY_ON) {
    const btn = document.createElement("button");
    btn.textContent = "Try It On ✨";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "999px";
    btn.style.border = "none";
    btn.style.cursor = "pointer";
    btn.style.fontSize = "14px";
    btn.style.fontWeight = "600";
    btn.style.background = "linear-gradient(135deg,#111,#444)";
    btn.style.color = "#fff";
    btn.style.boxShadow = "0 8px 24px rgba(0,0,0,.25)";
    btn.addEventListener("click", () => {
      void (async () => {
        const payload = await detectProductWithCatalogRules();
        await chrome.storage.session.set({ mirrorProduct: payload });
        ensureOverlayIframe();
      })();
    });
    shadow.appendChild(btn);
    return;
  }

  const style = document.createElement("style");
  style.textContent = `
    :host {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow: visible;
    }
    .chip-wrap {
      position: relative;
      padding: 4px;
      overflow: visible;
    }
    .chip {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #1b4de4;
      color: #fff;
      padding: 8px 12px 8px 12px;
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      font-size: 15px;
      font-weight: 500;
      letter-spacing: -0.01em;
      cursor: grab;
      touch-action: none;
      user-select: none;
      white-space: nowrap;
      overflow: visible;
    }
    .chip:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .chip-wrap:hover .chip {
      filter: brightness(1.04);
    }
    .chip-wrap:active .chip {
      transform: scale(0.98);
      transform-origin: center;
    }
    .chip-wrap.mirror-chip-dragging .chip,
    .chip-wrap.mirror-chip-dragging:active .chip {
      transform: none;
      cursor: grabbing;
    }
    .chip-text {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-style: italic;
      font-weight: 400;
      font-size: 17px;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }
    .chip-dots {
      display: grid;
      grid-template-columns: repeat(2, 3px);
      grid-template-rows: repeat(3, 3px);
      gap: 3px;
      margin: -6px -4px -6px 3px;
      padding: 6px 4px;
      box-sizing: content-box;
      opacity: 0;
      transition: opacity 160ms ease;
      pointer-events: none;
    }
    .chip-dots span {
      width: 3px;
      height: 3px;
      background: rgba(255, 255, 255, 0.85);
      border-radius: 50%;
    }
    .chip-wrap:hover .chip-dots {
      opacity: 1;
    }
    .close {
      position: absolute;
      top: -25px;
      right: 4px;
      z-index: 1;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border: none;
      padding: 0;
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease;
    }
    .close svg {
      width: 12px;
      height: 12px;
      stroke: #2a2a2a;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
    }
    .close:hover {
      background: #f7f7f7;
    }
    .chip-wrap:hover .close {
      opacity: 1;
      pointer-events: auto;
    }
  `;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "chip-wrap";

  const chip = document.createElement("div");
  chip.className = "chip";
  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "0");
  chip.setAttribute(
    "aria-label",
    "Open Mirror side panel. Drag to reposition.",
  );

  const chipText = document.createElement("span");
  chipText.className = "chip-text";
  chipText.textContent = "mirror";

  const dots = document.createElement("div");
  dots.className = "chip-dots";
  dots.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i += 1) {
    dots.appendChild(document.createElement("span"));
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "close";
  closeBtn.setAttribute("aria-label", "Dismiss Mirror chip");
  closeBtn.setAttribute("tabindex", "-1");
  closeBtn.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';

  chip.append(chipText, dots, closeBtn);
  wrap.appendChild(chip);

  const openMirror = (): void => {
    void (async () => {
      const payload = await detectProductWithCatalogRules();
      await chrome.storage.session.set({ mirrorProduct: payload });
      ensureOverlayIframe();
    })();
  };

  let suppressChipOpenClick = false;

  chip.addEventListener("click", (e: MouseEvent) => {
    if (suppressChipOpenClick) {
      e.preventDefault();
      e.stopPropagation();
      suppressChipOpenClick = false;
      return;
    }
    openMirror();
  });
  chip.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMirror();
    }
  });

  chip.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    if (e.target instanceof Node && closeBtn.contains(e.target)) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const rect = host.getBoundingClientRect();
    applyMirrorHostPositionPx(host, rect.left, rect.top);
    const r0 = host.getBoundingClientRect();
    const originLeft = r0.left;
    const originTop = r0.top;
    wrap.classList.add("mirror-chip-dragging");
    const startX = e.clientX;
    const startY = e.clientY;
    let maxDistance = 0;
    chip.setPointerCapture(e.pointerId);

    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      maxDistance = Math.max(maxDistance, Math.hypot(dx, dy));
      applyMirrorHostPositionPx(host, originLeft + dx, originTop + dy);
    };

    const onUp = (ev: PointerEvent): void => {
      if (chip.hasPointerCapture(ev.pointerId)) {
        chip.releasePointerCapture(ev.pointerId);
      }
      chip.removeEventListener("pointermove", onMove);
      chip.removeEventListener("pointerup", onUp);
      chip.removeEventListener("pointercancel", onUp);
      wrap.classList.remove("mirror-chip-dragging");
      if (maxDistance >= CHIP_DRAG_THRESHOLD_PX) {
        suppressChipOpenClick = true;
        const r = host.getBoundingClientRect();
        const s = applyMirrorHostPositionPxSnapped(host, r.left, r.top);
        writeEntryChipPositionToTab(s.left, s.top);
      } else {
        applyMirrorHostPositionPx(host, originLeft, originTop);
      }
    };

    chip.addEventListener("pointermove", onMove);
    chip.addEventListener("pointerup", onUp);
    chip.addEventListener("pointercancel", onUp);
  });

  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMirrorEntryChipDismissedInTab();
    document.getElementById("mirror-host")?.remove();
  });

  shadow.appendChild(wrap);

  const savedPos = readEntryChipPositionFromTab();
  if (savedPos) {
    const s = applyMirrorHostPositionPxSnapped(host, savedPos.left, savedPos.top);
    writeEntryChipPositionToTab(s.left, s.top);
  }
}

/** SPAs (e.g. Amazon) can remove injected nodes on client-side navigation; re-mount the pill. */
function scheduleMirrorHostRemount(): void {
  let lastHref = location.href;

  const ensurePill = (): void => {
    if (!document.body) {
      return;
    }
    if (document.getElementById("mirror-host")) return;
    if (isMirrorEntryChipDismissedInTab()) return;
    mountShadowEntry();
  };

  const tick = (): void => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      clearMirrorEntryChipDismissedInTab();
    }
    ensurePill();
  };

  window.addEventListener("popstate", tick);
  setInterval(tick, 1000);
}

function tryMountMirrorChip(): void {
  if (!document.body) {
    return;
  }
  if (document.getElementById("mirror-host")) return;
  if (isMirrorEntryChipDismissedInTab()) return;
  mountShadowEntry();
}

export function initMirrorContentScript(): void {
  void chrome.storage.session.remove(MIRROR_CHIP_DISMISSED_LEGACY_CHROME_KEY);

  if (!mirrorHostResizeListenerAttached) {
    mirrorHostResizeListenerAttached = true;
    globalThis.window.addEventListener("resize", reclampMirrorHostIfNeeded);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      tryMountMirrorChip();
      scheduleMirrorHostRemount();
    });
  } else {
    tryMountMirrorChip();
    scheduleMirrorHostRemount();
  }
}
