"use client";

import { useEffect, useState } from "react";

import { getTickSnapshot, subscribeTick } from "@/stores/tick-store";

/**
 * O contador de segundos compartilhado do `tick-store`, como valor de render.
 *
 * Cinco lugares mantinham um `setInterval` de 1s próprio — cada um com seu
 * timer, seu cleanup e um re-render por segundo mesmo com a aba em background.
 * O `tick-store` já resolvia isso: um intervalo para todos, ativo só enquanto
 * alguém escuta. Faltava a ponte para o React, que é este hook.
 *
 * `enabled` desliga a assinatura sem quebrar a ordem dos hooks: um countdown
 * que chegou ao fim, um carrossel de um item só ou um timer pausado param de
 * re-renderizar, e o intervalo global some quando o último subscriber sai.
 */
export function useTick(enabled = true): number {
  const [tick, setTick] = useState(getTickSnapshot);

  useEffect(() => {
    if (!enabled) return;
    return subscribeTick(() => setTick(getTickSnapshot()));
  }, [enabled]);

  return enabled ? tick : 0;
}
