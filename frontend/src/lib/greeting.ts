/**
 * Returns a time-appropriate greeting in Portuguese based on the user's timezone.
 * - 05:00–11:59 → "Bom dia"
 * - 12:00–17:59 → "Boa tarde"
 * - 18:00–04:59 → "Boa noite"
 */
export function getGreeting(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(formatter.format(new Date()), 10);

    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  } catch {
    // Fallback if timezone is invalid
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Bom dia";
    if (hour >= 12 && hour < 18) return "Boa tarde";
    return "Boa noite";
  }
}
