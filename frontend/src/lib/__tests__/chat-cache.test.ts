import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  listChatWindows,
  prependChatMessage,
} from "@/lib/chat-cache";
import { queryKeys } from "@/lib/query-keys";
import type { ChatMessage, MessageListResponse } from "@/lib/types/chat";

const GROUP = "g-1";
const ME = "user-1";

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    group_id: GROUP,
    round_id: null,
    author: {
      user_id: "user-2",
      username: "outro",
      display_name: "Outro",
      avatar_url: null,
    },
    content_type: "text",
    content_text: "oi",
    content_rich_json: null,
    media_url: null,
    thumbnail_url: null,
    reference_type: null,
    reference_value: null,
    is_spoiler: false,
    spoiler_chapter: null,
    parent_message_id: null,
    reply_count: 0,
    reactions: [],
    created_at: "2026-01-01T10:00:00Z",
    updated_at: null,
    is_deleted: false,
    ...overrides,
  };
}

/**
 * #272: `useViewerChapter` guarda seu `MessageListResponse` sob o mesmo
 * prefixo `chat.ofGroup` de propósito (ver comentário em `query-keys.ts`), mas
 * o dado não é uma janela paginada — não tem `.pages`. Antes do fix, qualquer
 * função que tratasse "algo sob o prefixo" como `ChatWindow` sem checar o
 * shape explodia assim que essa query carregava, derrubando o `onMutate` do
 * envio antes de qualquer rede sair.
 */
function seedViewerChapterEntry(client: QueryClient): void {
  const viewerChapterResponse: MessageListResponse = {
    messages: [],
    next_cursor: null,
  };
  client.setQueryData(
    queryKeys.chat.viewerChapter(GROUP, ME),
    viewerChapterResponse,
  );
}

describe("chat-cache: prefixo compartilhado com viewerChapter", () => {
  it("listChatWindows não explode quando viewerChapter já carregou", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chat.messages(GROUP, {}), {
      pages: [{ messages: [makeMessage()], next_cursor: null }],
      pageParams: [undefined],
    });
    seedViewerChapterEntry(client);

    expect(() => listChatWindows(client, GROUP)).not.toThrow();
    const windows = listChatWindows(client, GROUP);
    expect(windows).toHaveLength(1);
    expect(windows[0]?.window.pages[0]?.messages).toHaveLength(1);
  });

  it("prependChatMessage (via setQueriesData) não explode com viewerChapter no cache", () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.chat.messages(GROUP, {}), {
      pages: [{ messages: [makeMessage()], next_cursor: null }],
      pageParams: [undefined],
    });
    seedViewerChapterEntry(client);

    const optimistic = makeMessage({ id: "optimistic-1", content_text: "nova" });
    expect(() => prependChatMessage(client, GROUP, optimistic)).not.toThrow();

    const windows = listChatWindows(client, GROUP);
    expect(windows[0]?.window.pages[0]?.messages[0]?.id).toBe("optimistic-1");
  });

  it("listChatWindows ignora janelas vazias e a entrada de viewerChapter sem contá-las", () => {
    const client = new QueryClient();
    seedViewerChapterEntry(client);

    expect(listChatWindows(client, GROUP)).toHaveLength(0);
  });
});
