import { closeExtensionSidePanel } from "./closeSidePanel";
import { MIRROR_CLOSE_OVERLAY_MESSAGE_TYPE } from "./mirrorOverlayMessages";

/** True when this document is embedded in a retailer page (overlay iframe), not the Chrome side panel. */
export function isMirrorPageOverlayFrame(): boolean {
  try {
    return window.parent !== window.self;
  } catch {
    return true;
  }
}

/**
 * Close the Mirror UI: notify the parent page when running inside the overlay iframe,
 * otherwise close the extension side panel (or window).
 */
export function closeMirrorUi(): void {
  if (isMirrorPageOverlayFrame()) {
    window.parent.postMessage({ type: MIRROR_CLOSE_OVERLAY_MESSAGE_TYPE }, "*");
    return;
  }
  void closeExtensionSidePanel();
}
