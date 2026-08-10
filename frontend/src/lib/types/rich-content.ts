/**
 * O que viaja em `content_rich_json`.
 *
 * O campo é uma coluna JSONB no backend, e por muito tempo o frontend o
 * declarava como `Record<string, unknown>`. Isso descrevia a serialização, não o
 * conteúdo: qualquer chave era aceita na escrita, e toda leitura precisava de um
 * `as` para virar algo utilizável. O `as` é o problema — `foo as string` não
 * verifica nada em runtime, então um valor que não fosse string chegava intacto
 * ao JSX e derrubava a árvore com "Objects are not valid as a React child".
 *
 * Na prática o campo carrega uma de duas coisas, escolhidas pelo `content_type`
 * da mensagem:
 *
 * - `text` → o documento do Tiptap (`RichTextDoc`), gerado por `editor.getJSON()`
 *   e sanitizado no backend por `app/security/tiptap.py`.
 * - `quote` → a atribuição do livro (`QuoteMetadata`), lida pelo `QuoteCard`.
 *
 * A união abaixo diz exatamente isso, e `readQuoteAttribution` é a única porta
 * de leitura da segunda — validando tipo em runtime, porque o valor vem do
 * banco e o banco guarda o que foi gravado, não o que o tipo promete.
 */

/** Valores que o Tiptap coloca em `attrs` — `level`, `href`, `start`, `target`… */
export type RichTextAttrs = Record<string, string | number | boolean | null>;

export interface RichTextMark {
  type: string;
  attrs?: RichTextAttrs;
}

export interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: RichTextAttrs;
  marks?: RichTextMark[];
  content?: RichTextNode[];
}

/** O documento inteiro — a raiz é um nó `doc` com `content`. */
export type RichTextDoc = RichTextNode;

/** A atribuição de livro que acompanha uma mensagem de quote. */
export interface QuoteMetadata {
  book_title?: string | null;
  book_author?: string | null;
}

export type MessageRichContent = RichTextDoc | QuoteMetadata;

export interface QuoteAttribution {
  bookTitle: string | null;
  bookAuthor: string | null;
}

/**
 * Lê título e autor de uma mensagem de quote.
 *
 * Devolve `null` para tudo que não seja string não-vazia. O `.trim()` existe
 * porque um título só de espaços passaria no `if (bookTitle)` do card e abriria
 * o bloco de atribuição vazio, com ícone e sem texto.
 */
export function readQuoteAttribution(
  content: MessageRichContent | null | undefined,
): QuoteAttribution {
  if (!content) return { bookTitle: null, bookAuthor: null };

  const rawTitle = "book_title" in content ? content.book_title : null;
  const rawAuthor = "book_author" in content ? content.book_author : null;

  return {
    bookTitle: asDisplayString(rawTitle),
    bookAuthor: asDisplayString(rawAuthor),
  };
}

function asDisplayString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
