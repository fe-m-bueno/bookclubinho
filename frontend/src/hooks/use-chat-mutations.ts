"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import {
  dropChatMessage,
  listChatWindows,
  markChatMessageDeleted,
  patchChatMessage,
  prependChatMessage,
  replaceChatMessage,
} from "@/lib/chat-cache";
import { queryKeys } from "@/lib/query-keys";
import type {
  ChatMessage,
  MessageCreatePayload,
  MessageEditPayload,
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
    // O preview local cobre o intervalo até a resposta do servidor, que traz a
    // URL resolvida a partir da chave.
    media_url: payload.previewUrl ?? payload.media_url ?? null,
    thumbnail_url: payload.previewUrl ?? null,
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
  optimisticId: string;
}

/**
 * Guarda a mensagem que o servidor devolveu, preservando `reply_count`.
 *
 * Editar, apagar e reagir respondem com a mensagem atualizada — mas o backend
 * monta essa resposta por `_reload_and_respond`, que não recalcula
 * `reply_count` e manda sempre `0`. Só a listagem calcula. Sobrescrever com a
 * resposta zeraria o "3 respostas" de uma mensagem só porque alguém reagiu
 * nela, então o valor que já está em cache vence.
 */
function storeServerMessage(queryClient: QueryClient, message: ChatMessage): void {
  patchChatMessage(queryClient, message.group_id, message.id, (previous) => ({
    ...message,
    reply_count: previous.reply_count,
  }));
}

export function useSendMessage(
  groupId: string,
  currentUser: { id: string; name: string; avatar: string | null },
) {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, MessageCreatePayload, SendMessageContext>({
    mutationFn: async (payload) => {
      // previewUrl é local: o servidor rejeita URL de mídia vinda do cliente.
      const { previewUrl: _previewUrl, ...body } = payload;
      const res = await api.post<ChatMessage>(`/groups/${groupId}/messages`, body);
      return res;
    },
    onMutate: async (payload) => {
      const optimistic = makeOptimisticMessage(
        payload,
        currentUser.id,
        currentUser.name,
        currentUser.avatar,
      );
      prependChatMessage(queryClient, groupId, optimistic);

      // Cancela em segundo plano, sem bloquear o envio: nenhum refetch de
      // leitura deveria poder atrasar ou derrubar uma escrita.
      if (listChatWindows(queryClient, groupId).length > 0) {
        void queryClient.cancelQueries(queryKeys.chat.ofGroup(groupId));
      }

      return { optimisticId: optimistic.id };
    },
    onSuccess: (message, _payload, context) => {
      replaceChatMessage(queryClient, groupId, context.optimisticId, message);
    },
    onError: (err, _payload, context) => {
      if (context) dropChatMessage(queryClient, groupId, context.optimisticId);
      toast.error(errorMessage(err));
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
    onSuccess: (msg) => storeServerMessage(queryClient, msg),
  });
}

export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, string>({
    mutationFn: async (messageId) => {
      const res = await api.del<ChatMessage>(`/messages/${messageId}`);
      return res;
    },
    onSuccess: (msg) => markChatMessageDeleted(queryClient, msg.group_id, msg.id),
  });
}

export function useToggleReaction() {
  const queryClient = useQueryClient();

  return useMutation<ChatMessage, Error, { messageId: string; payload: ReactionPayload }>({
    mutationFn: async ({ messageId, payload }) => {
      const res = await api.post<ChatMessage>(`/messages/${messageId}/reactions`, payload);
      return res;
    },
    onSuccess: (msg) => storeServerMessage(queryClient, msg),
  });
}
