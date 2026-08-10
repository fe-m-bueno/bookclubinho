import { describe, it, expect } from "vitest";

import { buildMessageRows } from "../message-rows";
import { makeMessage } from "./helpers";
import type { ChatMessage } from "@/lib/types/chat";

const BASE = new Date("2026-01-15T14:00:00Z");

function minutos(n: number): string {
  return new Date(BASE.getTime() + n * 60_000).toISOString();
}

function msg(
  id: string,
  autor: string,
  minuto: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return makeMessage({
    id,
    author: {
      user_id: autor,
      username: autor,
      display_name: autor,
      avatar_url: null,
    },
    created_at: minutos(minuto),
    ...extra,
  });
}

/** Quantos blocos as linhas formam. */
function blocos(messages: ChatMessage[]): number {
  return buildMessageRows(messages).filter((r) => r.isGroupStart).length;
}

/**
 * O agrupamento existia e quase nunca disparava.
 *
 * A janela era de dois minutos, e num clube do livro quase nenhuma mensagem
 * consecutiva chega em menos de dois minutos — então quase toda mensagem
 * abria bloco, com avatar e nome próprios, como se ninguém falasse duas vezes
 * seguidas. O que fecha um bloco agora são eventos, não o relógio.
 */
describe("buildMessageRows — o que fecha um bloco", () => {
  it("mantém num bloco só duas mensagens do mesmo autor a 20 minutos", () => {
    const rows = buildMessageRows([
      msg("m1", "ana", 0),
      msg("m2", "ana", 20),
    ]);

    expect(blocos([msg("m1", "ana", 0), msg("m2", "ana", 20)])).toBe(1);
    expect(rows[0].isGroupStart).toBe(true);
    expect(rows[0].isGroupEnd).toBe(false);
    expect(rows[1].isGroupStart).toBe(false);
    expect(rows[1].isGroupEnd).toBe(true);
  });

  it("corta quando outra pessoa fala no meio", () => {
    const conversa = [
      msg("m1", "ana", 0),
      msg("m2", "bruno", 1),
      msg("m3", "ana", 2),
    ];

    expect(blocos(conversa)).toBe(3);
    expect(buildMessageRows(conversa).every((r) => r.isGroupEnd)).toBe(true);
  });

  it("corta quando um marcador de capítulo entra no meio", () => {
    const conversa = [
      msg("m1", "ana", 0),
      msg("m2", "ana", 1, {
        content_type: "chapter_marker",
        reference_type: "chapter",
        reference_value: "12",
      }),
      msg("m3", "ana", 2),
    ];

    expect(blocos(conversa)).toBe(3);
  });

  it("corta no gap que dispara o separador de 30 minutos", () => {
    const conversa = [msg("m1", "ana", 0), msg("m2", "ana", 31)];
    const rows = buildMessageRows(conversa);

    expect(rows[1].separatorTimestamp).toBe(minutos(31));
    expect(rows[1].isGroupStart).toBe(true);
    expect(rows[0].isGroupEnd).toBe(true);
  });

  it("não corta em 30 minutos exatos — o separador é quem manda", () => {
    const rows = buildMessageRows([msg("m1", "ana", 0), msg("m2", "ana", 30)]);

    expect(rows[1].separatorTimestamp).toBeNull();
    expect(rows[1].isGroupStart).toBe(false);
  });

  it("dá a uma mensagem sozinha começo e fim do próprio bloco", () => {
    const rows = buildMessageRows([msg("m1", "ana", 0)]);

    expect(rows[0].isGroupStart).toBe(true);
    expect(rows[0].isGroupEnd).toBe(true);
  });

  it("marca o meio de um bloco de três como nem começo nem fim", () => {
    const rows = buildMessageRows([
      msg("m1", "ana", 0),
      msg("m2", "ana", 3),
      msg("m3", "ana", 6),
    ]);

    expect(rows.map((r) => [r.isGroupStart, r.isGroupEnd])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  /**
   * `isGroupEnd` olha a mensagem seguinte, então a última linha da lista muda
   * quando chega mensagem nova do mesmo autor: ela perde avatar e horário. É a
   * mudança de altura que o virtualizador precisa remedir.
   */
  it("tira o fim de bloco da penúltima quando o mesmo autor continua", () => {
    const antes = buildMessageRows([msg("m1", "ana", 0)]);
    const depois = buildMessageRows([msg("m1", "ana", 0), msg("m2", "ana", 4)]);

    expect(antes[0].isGroupEnd).toBe(true);
    expect(depois[0].isGroupEnd).toBe(false);
    // A chave não muda: o item virtual continua sendo a mesma mensagem.
    expect(depois[0].key).toBe(antes[0].key);
  });

  it("dá ao marcador começo e fim próprios, fora de qualquer bloco", () => {
    const rows = buildMessageRows([
      msg("m1", "ana", 0, {
        content_type: "page_marker",
        reference_type: "page",
        reference_value: "140",
      }),
    ]);

    expect(rows[0].isMarker).toBe(true);
    expect(rows[0].isGroupStart).toBe(true);
    expect(rows[0].isGroupEnd).toBe(true);
  });
});
