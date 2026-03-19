"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatStore } from "@/stores/chat-store";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type { TypingUser } from "@/lib/types/chat";

const THROTTLE_MS = 3_000;
const TYPING_EXPIRE_MS = 4_000;
const CLEANUP_INTERVAL_MS = 1_000;

export function useTypingIndicator(groupId: string, currentUserId: string) {
  const lastSentRef = useRef(0);

  // Emit typing event (throttled)
  const sendTyping = useCallback(async () => {
    const now = Date.now();
    if (now - lastSentRef.current < THROTTLE_MS) return;
    lastSentRef.current = now;

    try {
      await ensureCsrf();
      await fetch(`/api/v1/groups/${groupId}/messages/typing`, {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
      });
    } catch {
      // Fire-and-forget
    }
  }, [groupId]);

  // Cleanup expired typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const { typingUsers, removeTypingUser } = useChatStore.getState();
      const now = Date.now();
      for (const [userId, user] of typingUsers) {
        if (now - user.lastTypingAt > TYPING_EXPIRE_MS) {
          removeTypingUser(userId);
        }
      }
    }, CLEANUP_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Select the Map reference (stable until typing state changes)
  const typingUsersMap = useChatStore((s) => s.typingUsers);

  // Derive the filtered array only when the Map reference changes
  const typingUsers = useMemo<TypingUser[]>(() => {
    const result: TypingUser[] = [];
    for (const [userId, user] of typingUsersMap) {
      if (userId !== currentUserId) {
        result.push({ userId, displayName: user.displayName, avatarUrl: user.avatarUrl });
      }
    }
    return result;
  }, [typingUsersMap, currentUserId]);

  return { sendTyping, typingUsers };
}
