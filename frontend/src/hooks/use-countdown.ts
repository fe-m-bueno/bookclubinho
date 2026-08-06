"use client";

import { useTick } from "@/hooks/use-tick";

/**
 * Milissegundos que faltam até `deadline`, recalculados a cada segundo.
 *
 * O prazo é um instante, não um número que decrementa: quem conta é o relógio,
 * e o tick só diz quando olhar de novo. Um `setInterval` que subtrai 1 a cada
 * disparo erra quando o navegador engasga o timer com a aba em background — a
 * conta contra `Date.now()` não erra.
 *
 * Retorna 0 quando não há prazo ou o prazo já passou, e nesse caso não assina o
 * tick: countdown terminado não re-renderiza mais nada.
 */
export function useCountdown(deadline: number | null): number {
  const remaining = deadline === null ? 0 : Math.max(0, deadline - Date.now());
  useTick(remaining > 0);
  return remaining;
}
