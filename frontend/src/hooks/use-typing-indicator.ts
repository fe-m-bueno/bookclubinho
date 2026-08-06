"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatStore } from "@/stores/chat-store";
import { useTick } from "@/hooks/use-tick";
import { api } from "@/lib/api";
import type { TypingUser } from "@/lib/types/chat";

const THROTTLE_MS = 3_000;
const TYPING_EXPIRE_MS = 4_000;

export function useTypingIndicator(groupId: string, currentUserId: string) {
  const lastSentRef = useRef(0);

  // Emit typing event (throttled)
  const sendTyping = useCallback(async () => {
    const now = Date.now();
    if (now - lastSentRef.current < THROTTLE_MS) return;
    lastSentRef.current = now;

    try {
      await api.post(`/groups/${groupId}/messages/typing`);
    } catch {
      // Fire-and-forget
    }
  }, [groupId]);

  // Select the Map reference (stable until typing state changes)
  const typingUsersMap = useChatStore((s) => s.typingUsers);

  // A varredura dos indicadores expirados roda no tick compartilhado, e só
  // enquanto há alguém digitando: um chat parado não mantém timer nenhum.
  const tick = useTick(typingUsersMap.size > 0);

  useEffect(() => {
    const { typingUsers, removeTypingUser } = useChatStore.getState();
    const now = Date.now();
    for (const [userId, user] of typingUsers) {
      if (now - user.lastTypingAt > TYPING_EXPIRE_MS) {
        removeTypingUser(userId);
      }
    }
  }, [tick]);

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
