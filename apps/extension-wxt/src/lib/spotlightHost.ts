/** Host for Circle / Feed editorial eyebrows (design §6.4). */
export function spotlightHostFromUrl(url: string | undefined): string {
  const u = url?.trim();
  if (!u) return "—";
  try {
    return new URL(u).hostname.replace(/^www\./i, "");
  } catch {
    return "—";
  }
}
