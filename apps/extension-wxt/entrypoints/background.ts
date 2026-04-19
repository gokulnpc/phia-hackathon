const RULES_KEY = "mirror_catalog_rules_v1";
const RULES_AT_KEY = "mirror_catalog_rules_v1_at";
const RULES_TTL_MS = 60 * 60 * 1000;

function ensureSessionStorageForContentScripts(): void {
  void chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  });
}

async function refreshCatalogRules(token: string, apiBase: string): Promise<void> {
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}/api/v1/catalog/rules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`catalog rules ${res.status}`);
  }
  const data = (await res.json()) as { rules?: unknown[] };
  const rules = Array.isArray(data.rules) ? data.rules : [];
  await chrome.storage.local.set({
    [RULES_KEY]: JSON.stringify(rules),
    [RULES_AT_KEY]: Date.now(),
  });
}

export default defineBackground(() => {
  ensureSessionStorageForContentScripts();

  chrome.runtime.onInstalled.addListener(() => {
    ensureSessionStorageForContentScripts();
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "mirror:openTryOn") {
      void chrome.storage.session.set({ mirrorProduct: message.payload }).then(
        () => {
          sendResponse({ ok: true });
        },
        (err: unknown) => {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
        },
      );
      return true;
    }
    if (message?.type === "mirror:refreshCatalogRules") {
      const token = String(message.token ?? "");
      const apiBase = String(message.apiBase ?? "http://localhost:8000");
      if (!token) {
        sendResponse({ ok: false, error: "missing token" });
        return false;
      }
      void refreshCatalogRules(token, apiBase).then(
        () => {
          sendResponse({ ok: true });
        },
        (e: unknown) => {
          sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
        },
      );
      return true;
    }
    if (message?.type === "mirror:getCatalogRules") {
      chrome.storage.local.get([RULES_KEY, RULES_AT_KEY], (got) => {
        if (chrome.runtime.lastError) {
          sendResponse({ rules: [], stale: true });
          return;
        }
        const raw = got[RULES_KEY];
        const at = typeof got[RULES_AT_KEY] === "number" ? got[RULES_AT_KEY] : 0;
        let rules: unknown[] = [];
        if (typeof raw === "string") {
          try {
            rules = JSON.parse(raw) as unknown[];
          } catch {
            rules = [];
          }
        }
        sendResponse({ rules, stale: Date.now() - at > RULES_TTL_MS });
      });
      return true;
    }
    return false;
  });
});
