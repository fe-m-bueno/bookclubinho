/**
 * Tempo restante em texto curto: `2h 5m`, `5m 30s`, `12s`.
 *
 * A unidade menor só aparece quando a maior não domina a leitura — quem espera
 * duas horas não se importa com os segundos, quem espera doze segundos se
 * importa com cada um. Função pura de propósito: era trinta linhas dentro de um
 * `useEffect` com `setInterval`, e formatar não precisa de estado nem de timer.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, ms);
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
