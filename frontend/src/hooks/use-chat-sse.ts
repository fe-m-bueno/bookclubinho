"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChatStore } from "@/stores/chat-store";
import {
  applyCachedReaction,
  markChatMessageDeleted,
  syncLatestChatMessages,
} from "@/lib/chat-cache";
import type { ChatSSEEvent } from "@/lib/types/chat";

interface UseChatSSEOptions {
  groupId: string;
  currentUserId: string;
}

/**
 * `connecting`: ainda não recebeu o `connected` inicial — normal logo que o
 * chat abre, não é erro.
 * `connected`: stream de pé.
 * `disconnected`: já esteve `connected` e caiu — o único estado que merece
 * aviso. Sem essa distinção, o primeiro render (sempre `connecting`) e uma
 * queda de verdade pareciam a mesma coisa (#273).
 */
export type ChatSSEStatus = "connecting" | "connected" | "disconnected";

export function useChatSSE({ groupId, currentUserId }: UseChatSSEOptions) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ChatSSEStatus>("connecting");
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    setStatus("connecting");
    let hasConnected = false;
    // Rota própria, fora de `/api/v1`: o rewrite genérico do `next.config.ts`
    // buferiza o stream. Ver `app/api/chat-stream/[groupId]/route.ts`.
    const url = `/api/chat-stream/${groupId}`;
    const es = new EventSource(url, { withCredentials: true });
    esRef.current = es;

    es.addEventListener("connected", () => {
      hasConnected = true;
      setStatus("connected");
    });
    // O EventSource dispara `error` durante as tentativas normais de conexão
    // inicial também — só quem já viu `connected` uma vez está de fato caindo.
    es.onerror = () => setStatus(hasConnected ? "disconnected" : "connecting");

    // Rede fora no meio do stream não deve virar unhandled rejection: o
    // próximo evento, ou o refetch natural da janela, traz o que faltou.
    const syncLatest = () => {
      void syncLatestChatMessages(queryClient, groupId).catch(() => {});
    };

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

        // O eco do próprio evento: a mutação já escreveu no cache com a
        // resposta do servidor. Antes, cada ação minha atualizava o chat duas
        // vezes — uma pelo `onSuccess`, outra por aqui.
        if (event.user_id === currentUserId) return;

        if (event.type === "message_created") {
          if (!useChatStore.getState().isAtBottom) {
            useChatStore.getState().incrementUnread();
          }
          syncLatest();
          return;
        }

        if (event.type === "message_deleted") {
          markChatMessageDeleted(queryClient, groupId, event.message_id);
          return;
        }

        if (event.type === "reaction_added" || event.type === "reaction_removed") {
          applyCachedReaction(queryClient, groupId, {
            messageId: event.message_id,
            emoji: event.emoji,
            added: event.type === "reaction_added",
            // A reação é de outro membro: `did_i_react` continua como está.
            mine: false,
          });
          return;
        }

        // message_edited. O evento traz só o id — o conteúdo novo não vem nele,
        // e não existe endpoint de mensagem avulsa. Buscar a primeira página
        // resolve o caso real (editar acontece minutos depois de enviar); uma
        // edição em mensagem antiga só aparece no próximo refetch natural, o
        // que é o preço de não refetchar as dez páginas roladas.
        syncLatest();
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
    };
  }, [groupId, currentUserId, queryClient]);

  return { status, connected: status === "connected" };
}
