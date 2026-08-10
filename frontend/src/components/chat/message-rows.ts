import { differenceInMinutes, parseISO } from "date-fns";
import type { ChatMessage } from "@/lib/types/chat";

/** Gap acima do qual a mensagem ganha um separador de horário. */
const SEPARATOR_GAP_MINUTES = 30;

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
  /** Primeira linha de um bloco: ganha o nome do autor e espaçamento maior. */
  isGroupStart: boolean;
  /**
   * Última linha de um bloco: ganha o avatar e o horário.
   *
   * O avatar estava na primeira mensagem, e num bloco de três sobravam dois
   * vãos vazios embaixo dele. WhatsApp, iMessage e Telegram ancoram o fim da
   * fala, não o começo — e o horário, na última, marca quando a pessoa parou
   * de falar, que é a leitura fiel quando o bloco atravessa vários minutos.
   */
  isGroupEnd: boolean;
}

function isMarkerMessage(message: ChatMessage): boolean {
  return (
    message.content_type === "chapter_marker" ||
    message.content_type === "page_marker"
  );
}

/** Um gap grande o bastante para o separador cortar o bloco. */
function cortaPorTempo(anterior: ChatMessage, seguinte: ChatMessage): boolean {
  return (
    differenceInMinutes(
      parseISO(seguinte.created_at),
      parseISO(anterior.created_at),
    ) > SEPARATOR_GAP_MINUTES
  );
}

/**
 * Duas mensagens vizinhas continuam o mesmo bloco?
 *
 * Não há mais janela de tempo. Havia uma de dois minutos, e num clube do livro
 * quase nenhuma mensagem consecutiva chega em menos de dois minutos — o
 * agrupamento existia e quase nunca disparava, e cada mensagem vinha com
 * avatar e nome próprios como se ninguém tivesse falado duas vezes seguidas.
 *
 * Sobram três cortes, todos eventos e não relógios: outra pessoa falou, um
 * marcador entrou no meio, ou o separador de 30 minutos cortou. A deriva
 * temporal dentro de um bloco fica limitada a 30 minutos por construção, que é
 * o que o separador já promete.
 */
function mesmoBloco(anterior: ChatMessage, seguinte: ChatMessage): boolean {
  return (
    !isMarkerMessage(anterior) &&
    !isMarkerMessage(seguinte) &&
    anterior.author.user_id === seguinte.author.user_id &&
    !cortaPorTempo(anterior, seguinte)
  );
}

/**
 * Achata as mensagens em linhas renderizáveis.
 *
 * Cada linha depende só da mensagem e das vizinhas — nunca do índice absoluto,
 * exceto a primeira, que sempre abre com separador. Isso mantém as chaves e o
 * agrupamento estáveis quando páginas mais antigas entram no começo do array.
 *
 * `isGroupEnd` olha a mensagem seguinte, e por isso a última linha da lista
 * muda quando chega mensagem nova: se o mesmo autor continua falando, ela
 * deixa de ser fim de bloco e perde avatar e horário. É uma mudança de altura
 * num item já medido, e o virtualizador remede pelo `ResizeObserver` do
 * `measureElement` — sem `flushSync`, que é o caminho desligado no #274.
 */
export function buildMessageRows(messages: ChatMessage[]): MessageRow[] {
  const rows: MessageRow[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const prev = i > 0 ? messages[i - 1] : null;
    const next = i < messages.length - 1 ? messages[i + 1] : null;

    const needsSeparator = prev === null || cortaPorTempo(prev, message);
    const isMarker = isMarkerMessage(message);

    rows.push({
      key: message.id,
      message,
      isMarker,
      separatorTimestamp: needsSeparator ? message.created_at : null,
      isGroupStart: prev === null || !mesmoBloco(prev, message),
      isGroupEnd: next === null || !mesmoBloco(message, next),
    });
  }

  return rows;
}
