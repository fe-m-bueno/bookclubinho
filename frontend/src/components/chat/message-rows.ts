import { differenceInMinutes, parseISO } from "date-fns";
import type { ChatMessage } from "@/lib/types/chat";

/** Gap acima do qual a mensagem ganha um separador de horário. */
const SEPARATOR_GAP_MINUTES = 30;
/** Janela em que mensagens do mesmo autor continuam o mesmo bloco. */
const GROUP_WINDOW_MINUTES = 2;

export interface MessageRow {
  /**
   * Id da mensagem — a chave estável do item virtualizado.
   *
   * O item virtual é uma mensagem, não um bloco de mensagens, justamente para
   * que a chave nunca desapareça quando uma página anterior é carregada. Se o
   * item fosse o bloco, a mensagem do topo poderia ser absorvida pelo bloco
   * que veio na página nova, a chave antiga sumiria, e o virtualizador
   * perderia a âncora de scroll — que é o salto de posição que se quer evitar.
   */
  key: string;
  message: ChatMessage;
  /** Marcadores de capítulo/página ocupam a largura toda, fora de bloco. */
  isMarker: boolean;
  /** Horário do separador a renderizar acima da linha, quando houver. */
  separatorTimestamp: string | null;
  /** Primeira linha de um bloco: ganha avatar, nome e espaçamento maior. */
  isGroupStart: boolean;
}

function isMarkerMessage(message: ChatMessage): boolean {
  return (
    message.content_type === "chapter_marker" ||
    message.content_type === "page_marker"
  );
}

/**
 * Achata as mensagens em linhas renderizáveis.
 *
 * Cada linha depende só da mensagem e da anterior — nunca do índice absoluto,
 * exceto a primeira, que sempre abre com separador. Isso mantém as chaves e o
 * agrupamento estáveis quando páginas mais antigas entram no começo do array.
 */
export function buildMessageRows(messages: ChatMessage[]): MessageRow[] {
  const rows: MessageRow[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;

    const minutesSincePrev = prev
      ? differenceInMinutes(
          parseISO(message.created_at),
          parseISO(prev.created_at),
        )
      : null;

    const needsSeparator =
      minutesSincePrev === null || minutesSincePrev > SEPARATOR_GAP_MINUTES;

    const isMarker = isMarkerMessage(message);

    const isGroupStart =
      isMarker ||
      prev === null ||
      needsSeparator ||
      isMarkerMessage(prev) ||
      prev.author.user_id !== message.author.user_id ||
      (minutesSincePrev ?? 0) > GROUP_WINDOW_MINUTES;

    rows.push({
      key: message.id,
      message,
      isMarker,
      separatorTimestamp: needsSeparator ? message.created_at : null,
      isGroupStart,
    });
  }

  return rows;
}
