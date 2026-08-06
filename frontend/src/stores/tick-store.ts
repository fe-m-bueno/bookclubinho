/**
 * Módulo puro (sem React) que emite ticks a cada 1s.
 * O intervalo só roda enquanto há subscribers (auto-cleanup).
 *
 * Quem consome do lado do React é `hooks/use-tick.ts` — não assine daqui
 * direto num componente, senão volta a ser um timer por call site.
 */
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let tick = 0;

export function subscribeTick(cb: () => void): () => void {
  listeners.add(cb);
  if (listeners.size === 1) {
    intervalId = setInterval(() => {
      tick++;
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function getTickSnapshot(): number {
  return tick;
}
