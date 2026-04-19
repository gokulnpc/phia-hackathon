/** PDP URL alignment: same origin + pathname (ignores trailing slash); exact string match first. */
export function urlsMatchForSpotlight(currentTabUrl: string, storedPageUrl: string): boolean {
  const x = currentTabUrl.trim();
  const y = storedPageUrl.trim();
  if (!x || !y) return false;
  if (x === y) return true;
  try {
    const ux = new URL(x);
    const uy = new URL(y);
    const pathX = ux.pathname.replace(/\/$/, "") || "/";
    const pathY = uy.pathname.replace(/\/$/, "") || "/";
    return ux.origin === uy.origin && pathX === pathY;
  } catch {
    return false;
  }
}

/** tryon_jobs.product_metadata from PDP try-on includes `page_url`. */
export function readPageUrlFromProductMetadata(metadata: unknown): string | null {
  if (metadata === null || typeof metadata !== "object") return null;
  const raw = (metadata as Record<string, unknown>).page_url;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
