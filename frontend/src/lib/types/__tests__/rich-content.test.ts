import { describe, it, expect } from "vitest";
import {
  readQuoteAttribution,
  type MessageRichContent,
} from "@/lib/types/rich-content";

/**
 * O `content_rich_json` é uma coluna JSONB: o tipo do frontend descreve o que
 * deveria estar lá, não o que está. Estes testes usam `as MessageRichContent`
 * de propósito — é a simulação de um registro antigo, escrito antes de o
 * formato existir, chegando à leitura de hoje.
 */
function asContent(value: unknown): MessageRichContent {
  return value as MessageRichContent;
}

describe("readQuoteAttribution", () => {
  it("lê título e autor de uma quote bem formada", () => {
    expect(
      readQuoteAttribution({
        book_title: "Dom Casmurro",
        book_author: "Machado de Assis",
      }),
    ).toEqual({ bookTitle: "Dom Casmurro", bookAuthor: "Machado de Assis" });
  });

  it("devolve nulos para conteúdo ausente", () => {
    expect(readQuoteAttribution(null)).toEqual({
      bookTitle: null,
      bookAuthor: null,
    });
    expect(readQuoteAttribution(undefined)).toEqual({
      bookTitle: null,
      bookAuthor: null,
    });
  });

  it("devolve nulos para um documento Tiptap — não é uma quote", () => {
    const doc: MessageRichContent = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "oi" }] }],
    };
    expect(readQuoteAttribution(doc)).toEqual({
      bookTitle: null,
      bookAuthor: null,
    });
  });

  /**
   * O caso que o `as string` deixava passar: um valor que não é string chegava
   * intacto ao JSX. Com objeto, o React lança "Objects are not valid as a React
   * child" e a mensagem inteira desaparece da conversa.
   */
  it.each([
    ["um número", 42],
    ["um objeto", { pt: "Dom Casmurro" }],
    ["um array", ["Dom Casmurro"]],
    ["true", true],
    ["null", null],
  ])("descarta um título que é %s", (_label, title) => {
    expect(readQuoteAttribution(asContent({ book_title: title })).bookTitle).toBeNull();
  });

  it("descarta um autor que não é string", () => {
    expect(
      readQuoteAttribution(
        asContent({ book_title: "Dom Casmurro", book_author: 1899 }),
      ),
    ).toEqual({ bookTitle: "Dom Casmurro", bookAuthor: null });
  });

  it("trata título só de espaços como ausente", () => {
    expect(readQuoteAttribution({ book_title: "   " }).bookTitle).toBeNull();
  });

  it("apara espaços das pontas", () => {
    expect(readQuoteAttribution({ book_title: "  Dom Casmurro \n" })).toEqual({
      bookTitle: "Dom Casmurro",
      bookAuthor: null,
    });
  });
});
