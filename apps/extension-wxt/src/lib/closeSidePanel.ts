type SidePanelApi = typeof chrome.sidePanel & {
  close?: (options: { windowId: number }) => Promise<void>;
};

/**
 * Closes the extension side panel. Uses `chrome.sidePanel.close` when available (Chrome 141+),
 * otherwise falls back to `window.close()` for the side panel document.
 */
export async function closeExtensionSidePanel(): Promise<void> {
  const sidePanel = chrome.sidePanel as SidePanelApi;
  try {
    const win = await chrome.windows.getCurrent();
    if (typeof sidePanel.close === "function" && win.id != null) {
      await sidePanel.close({ windowId: win.id });
      return;
    }
  } catch {
    // Older Chrome or unsupported context — try window.close()
  }
  window.close();
}
