/**
 * Formats an invite code as XXXX-XXXX (uppercase, dash after 4th char).
 * Strips any non-alphanumeric characters before formatting.
 */
export function formatInviteCode(raw: string): string {
  const clean = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
  return clean.length > 4 ? clean.slice(0, 4) + "-" + clean.slice(4) : clean;
}
