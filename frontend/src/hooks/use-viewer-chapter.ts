"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { MessageListResponse } from "@/lib/types/chat";

/** Janela de marcadores lida. Além disso, o leitor cai no fallback sem capítulo. */
const MARKER_WINDOW = 50;

/**
 * Em que capítulo o leitor está — o que decide se um spoiler já pode aparecer
 * revelado.
 *
 * `ReadingProgress` não guarda capítulo (só página, percentual e um
 * `progress_type`), então a única fonte que existe hoje é o próprio chat: o
 * marcador de capítulo que o usuário postou. `reference_type=chapter` já é um
 * filtro do `GET /groups/{id}/messages`, então a busca é uma janela curta e
 * barata.
 *
 * É uma query própria de propósito, e não uma leitura da lista já carregada:
 * aquela é paginada (o marcador do usuário pode estar numa página que ninguém
 * rolou até) e é filtrada pelo `chapterFilter` do header — filtrar o chat no
 * capítulo 2 rebaixaria o leitor para o capítulo 2 e re-esconderia spoilers.
 *
 * A chave começa com o prefixo `chat.ofGroup`, então mensagem nova via SSE ou
 * envio já invalida isto junto: marcar "Capítulo 6" revela na hora os spoilers
 * até o 6.
 */
export function useViewerChapter(
  groupId: string,
  currentUserId: string,
): number | null {
  const { data } = useQuery<MessageListResponse, Error>({
    queryKey: queryKeys.chat.viewerChapter(groupId, currentUserId),
    queryFn: () =>
      api.get<MessageListResponse>(
        `/groups/${groupId}/messages?reference_type=chapter&limit=${MARKER_WINDOW}`,
      ),
  });

  return useMemo(() => {
    if (!data) return null;

    // A resposta vem do mais novo para o mais antigo. O primeiro marcador do
    // próprio usuário é o mais recente — e é ele que diz onde o leitor está.
    // O maior valor mentiria: quem postou "Capítulo 10" e depois "Capítulo 3"
    // voltou para o 3.
    for (const message of data.messages) {
      if (
        message.content_type !== "chapter_marker" ||
        message.author.user_id !== currentUserId ||
        message.is_deleted
      ) {
        continue;
      }
      const chapter = Number.parseInt(message.reference_value ?? "", 10);
      return Number.isNaN(chapter) ? null : chapter;
    }

    // Leitor sem marcador na janela: nenhum auto-reveal, todo spoiler pede clique.
    return null;
  }, [data, currentUserId]);
}
