/** Base URL for the Mirror web app (no trailing slash). Used to open signup/login in a tab. */
export function getMirrorWebBase(): string | undefined {
  const raw = import.meta.env.VITE_MIRROR_WEB_URL as string | undefined;
  const b = raw?.trim();
  if (!b) return undefined;
  return b.replace(/\/$/, "");
}

export function openMirrorWebPath(path: string): void {
  const base = getMirrorWebBase();
  if (!base) return;
  const p = path.startsWith("/") ? path : `/${path}`;
  void chrome.tabs.create({ url: `${base}${p}` });
}
