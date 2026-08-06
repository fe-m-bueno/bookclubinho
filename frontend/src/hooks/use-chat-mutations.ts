"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
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

interface SendMessageContext {
  previousData: { pages: MessageListResponse[]; pageParams: unknown[] } | undefined;
}

export function useSendMessage(
  groupId: string,
  currentUser: { id: string; name: string; avatar: string | null },
) {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, MessageCreatePayload, SendMessageContext>({
    mutationFn: async (payload) => {
      const res = await api.post<ChatMessage>(`/groups/${groupId}/messages`, payload);
      return res;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["chat-messages", groupId] });
      const previousData = queryClient.getQueryData<{
        pages: MessageListResponse[];
        pageParams: unknown[];
      }>(["chat-messages", groupId]);

      // Optimistic update: prepend to first page (newest)
      if (previousData && previousData.pages.length > 0) {
        const optimistic = makeOptimisticMessage(
          payload,
          currentUser.id,
          currentUser.name,
          currentUser.avatar,
        );
        const firstPage = previousData.pages[0];
        queryClient.setQueryData(
          ["chat-messages", groupId],
          {
            ...previousData,
            pages: [
              { ...firstPage, messages: [optimistic, ...firstPage.messages] },
              ...previousData.pages.slice(1),
            ],
          },
        );
      }

      return { previousData };
    },
    onError: (_err, _payload, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["chat-messages", groupId], context.previousData);
      }
    },
  });
}

export function useEditMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, { messageId: string; payload: MessageEditPayload }>({
    mutationFn: async ({ messageId, payload }) => {
      const res = await api.patch<ChatMessage>(`/messages/${messageId}`, payload);
      return res;
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
      const res = await api.del<ChatMessage>(`/messages/${messageId}`);
      return res;
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
      const res = await api.post<ChatMessage>(`/messages/${messageId}/reactions`, payload);
      return res;
    },
    onSuccess: (msg) => {
      queryClient.invalidateQueries({ queryKey: ["chat-messages", msg.group_id] });
    },
  });
}
