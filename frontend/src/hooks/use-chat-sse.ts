"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chat-store";
import type { ChatSSEEvent } from "@/lib/types/chat";

interface UseChatSSEOptions {
  groupId: string;
  currentUserId: string;
}

export function useChatSSE({ groupId, currentUserId }: UseChatSSEOptions) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `/api/v1/groups/${groupId}/chat/stream`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    const handleEvent = (eventType: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as Record<string, string>;
        const event = { type: eventType, ...data } as ChatSSEEvent;

        if (event.type === "user_typing") {
          if (event.user_id === currentUserId) return;
          useChatStore.getState().setTypingUser(event.user_id, {
            displayName: event.display_name,
            avatarUrl: event.avatar_url,
            lastTypingAt: Date.now(),
          });
          return;
        }

        if (event.type === "message_created") {
          if (event.user_id !== currentUserId) {
            const isAtBottom = useChatStore.getState().isAtBottom;
            if (!isAtBottom) {
              useChatStore.getState().incrementUnread();
            }
          }
          queryClient.invalidateQueries({
            queryKey: ["chat-messages", groupId],
          });
          return;
        }

        // message_edited, message_deleted, reaction_added, reaction_removed
        queryClient.invalidateQueries({
          queryKey: ["chat-messages", groupId],
        });
      } catch {
        // Ignore malformed events
      }
    };

    const eventTypes = [
      "message_created",
      "message_edited",
      "message_deleted",
      "reaction_added",
      "reaction_removed",
      "user_typing",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, handleEvent(type));
    }

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [groupId, currentUserId, queryClient]);

  return { connected };
}
