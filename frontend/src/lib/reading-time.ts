/**
 * Minutos de leitura em algo que se lê de relance.
 *
 * Estava duplicado em `user-profile-client.tsx` e `profile-settings-client.tsx`
 * com o mesmo corpo; o trilho da home seria a terceira cópia.
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}
