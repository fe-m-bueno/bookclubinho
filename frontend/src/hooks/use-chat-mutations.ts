"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type {
  ChatMessage,
  MessageCreatePayload,
  MessageEditPayload,
  MessageListResponse,
  ReactionPayload,
} from "@/lib/types/chat";

function makeOptimisticMessage(
  payload: MessageCreatePayload,
  currentUserId: string,
  currentUserName: string,
  currentUserAvatar: string | null,
): ChatMessage {
  return {
    id: `optimistic-${crypto.randomUUID()}`,
    group_id: "",
    round_id: payload.round_id ?? null,
    author: {
      user_id: currentUserId,
      username: currentUserName,
      display_name: currentUserName,
      avatar_url: currentUserAvatar,
    },
    content_type: payload.content_type,
    content_text: payload.content_text ?? null,
    content_rich_json: payload.content_rich_json ?? null,
    media_url: payload.media_url ?? null,
    thumbnail_url: payload.thumbnail_url ?? null,
    reference_type: payload.reference_type ?? null,
    reference_value: payload.reference_value ?? null,
    is_spoiler: payload.is_spoiler ?? false,
    spoiler_chapter: payload.spoiler_chapter ?? null,
    parent_message_id: payload.parent_message_id ?? null,
    reply_count: 0,
    reactions: [],
    created_at: new Date().toISOString(),
    updated_at: null,
    is_deleted: false,
  };
}

type InfiniteData = { pages: MessageListResponse[]; pageParams: unknown[] };

interface SendMessageContext {
  snapshots: [unknown, InfiniteData | undefined][];
}

export function useSendMessage(
  groupId: string,
  currentUser: { id: string; name: string; avatar: string | null },
) {
  const queryClient = useQueryClient();
  const queryFilter = { queryKey: ["chat-messages", groupId] } as const;

  return useMutation<ChatMessage, Error, MessageCreatePayload, SendMessageContext>({
    mutationFn: async (payload) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/groups/${groupId}/messages`, {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao enviar mensagem");
      }
      return res.json();
    },
    onMutate: async (payload) => {
      // Cancel any in-flight refetches for all chat-messages variants
      await queryClient.cancelQueries(queryFilter);

      // Snapshot ALL matching queries (any chapterFilter/roundId variant)
      const snapshots = queryClient.getQueriesData<InfiniteData>(queryFilter);

      const optimistic = makeOptimisticMessage(
        payload,
        currentUser.id,
        currentUser.name,
        currentUser.avatar,
      );

      // Apply optimistic update to every matching query
      queryClient.setQueriesData<InfiniteData>(queryFilter, (old) => {
        if (!old || old.pages.length === 0) return old;
        const firstPage = old.pages[0];
        return {
          ...old,
          pages: [
            { ...firstPage, messages: [optimistic, ...firstPage.messages] },
            ...old.pages.slice(1),
          ],
        };
      });

      return { snapshots };
    },
    onError: (_err, _payload, context) => {
      // Roll back all affected queries
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key as string[], data);
      }
    },
    onSettled: () => {
      // Ensure cache is eventually consistent (fallback if SSE is delayed/dropped)
      queryClient.invalidateQueries(queryFilter);
    },
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, { messageId: string; payload: MessageEditPayload }>({
    mutationFn: async ({ messageId, payload }) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/messages/${messageId}`, {
        method: "PATCH",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao editar mensagem");
      }
      return res.json();
    },
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.group_id] });
    },
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, string>({
    mutationFn: async (messageId) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/messages/${messageId}`, {
        method: "DELETE",
        headers: withCsrf(),
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao apagar mensagem");
      }
      return res.json();
    },
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.group_id] });
    },
  });
}

export function useToggleReaction() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, { messageId: string; payload: ReactionPayload }>({
    mutationFn: async ({ messageId, payload }) => {
      await ensureCsrf();
      const res = await fetch(`/api/v1/messages/${messageId}/reactions`, {
        method: "POST",
        headers: withCsrf({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Erro ao reagir");
      }
      return res.json();
    },
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.group_id] });
    },
  });
}
