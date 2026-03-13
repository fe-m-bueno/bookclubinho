"use client";

import { useEffect, useRef, useState } from "react";

export const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;
const DEBOUNCE_MS = 500;

export type UsernameStatus = "idle" | "checking" | "available" | "taken" | "error";

export function useUsernameCheck(username: string) {
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!username || !USERNAME_REGEX.test(username)) {
      setStatus("idle");
      return;
    }

    setStatus("checking");

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/v1/users/check-username/${encodeURIComponent(username)}`,
          { credentials: "include", signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        if (res.ok) {
          const data: { available: boolean } = await res.json();
          setStatus(data.available ? "available" : "taken");
        } else {
          setStatus("error");
        }
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [username]);

  return { status };
}
