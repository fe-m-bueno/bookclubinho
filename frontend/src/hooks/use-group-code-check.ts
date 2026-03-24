import { useEffect, useRef, useState } from "react";

export const INVITE_CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_REGEX = new RegExp(`^[${INVITE_CODE_CHARS}]{8}$`);
const DEBOUNCE_MS = 500;

export type GroupCodeStatus = "idle" | "checking" | "valid" | "not_found" | "error";

export interface ValidatedGroup {
  name: string;
  photo_url: string | null;
  member_count: number;
}

export function useGroupCodeCheck(code: string, debounceMs = DEBOUNCE_MS) {
  const [status, setStatus] = useState<GroupCodeStatus>("idle");
  const [group, setGroup] = useState<ValidatedGroup | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!code || !CODE_REGEX.test(code)) {
      setStatus("idle");
      setGroup(null);
      return;
    }

    setStatus("checking");

    const run = async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `/api/v1/groups/validate/${encodeURIComponent(code)}`,
          { credentials: "include", signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        if (res.ok) {
          const data: ValidatedGroup = await res.json();
          setGroup(data);
          setStatus("valid");
        } else if (res.status === 404) {
          setGroup(null);
          setStatus("not_found");
        } else {
          setGroup(null);
          setStatus("error");
        }
      } catch {
        if (!controller.signal.aborted) {
          setGroup(null);
          setStatus("error");
        }
      }
    };

    if (debounceMs > 0) {
      timerRef.current = setTimeout(run, debounceMs);
    } else {
      run();
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [code, debounceMs]);

  return { status, group };
}
