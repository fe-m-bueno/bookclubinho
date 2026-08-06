"use client";

import { useCallback, useState } from "react";

import { useCountdown } from "@/hooks/use-countdown";

export function useResendCooldown(durationSeconds = 60) {
  // O que o hook guarda é o prazo, não o quanto falta: o resto é conta.
  const [deadline, setDeadline] = useState<number | null>(null);
  const remainingMs = useCountdown(deadline);

  const start = useCallback(() => {
    setDeadline(Date.now() + durationSeconds * 1_000);
  }, [durationSeconds]);

  const remaining = Math.ceil(remainingMs / 1_000);

  return { remaining, start, isActive: remaining > 0 };
}
