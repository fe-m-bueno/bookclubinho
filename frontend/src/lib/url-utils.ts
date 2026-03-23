/** Strips trailing punctuation characters unlikely to be part of a URL. */
export const TRAILING_PUNCT_RE = /[.,;:!?)]+$/;

/**
 * Extracts valid http/https URLs from a string.
 * Strips trailing punctuation that is unlikely to be part of the URL.
 */
export function extractUrls(text: string): string[] {
  const raw = text.match(/https?:\/\/[^\s<>"')\]]+/g);
  if (!raw) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const match of raw) {
    const url = match.replace(TRAILING_PUNCT_RE, "");
    if (!isValidHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }

  return result;
}

/** Returns true only for valid http/https URLs. */
export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
