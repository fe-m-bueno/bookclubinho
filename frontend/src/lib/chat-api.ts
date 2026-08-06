import { api } from "@/lib/api";
import type { MessageListResponse } from "@/lib/types/chat";

/** Os filtros que definem uma janela de mensagens — e a query key dela. */
export interface ChatMessagesFilters {
  roundId?: string | null;
  chapterFilter?: number | null;
}

export const CHAT_PAGE_SIZE = 30;

/**
 * Uma página de mensagens do clube, mais recentes primeiro.
 *
 * Mora fora do hook porque o SSE também precisa dela: quando outro membro
 * manda mensagem, buscar só a primeira página é bem mais barato que invalidar
 * o infinite query e refetchar as dez que o usuário já rolou.
 */
export function fetchChatMessagesPage(
  groupId: string,
  filters: ChatMessagesFilters,
  cursor?: string,
): Promise<MessageListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(CHAT_PAGE_SIZE));
  if (cursor) params.set("cursor", cursor);
  if (filters.roundId) params.set("round_id", filters.roundId);
  if (filters.chapterFilter != null) params.set("reference_type", "chapter");

  // 401/403/404 vinham com mensagem escrita à mão aqui; agora a do backend
  // chega em ApiError.detail, e o redirect do 401 é do Providers.
  return api.get<MessageListResponse>(
    `/groups/${groupId}/messages?${params.toString()}`,
  );
}
