import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installVirtualLayout,
  type VirtualLayoutHarness,
} from "./virtual-layout-harness";

vi.mock("framer-motion");

// O container monta o editor Tiptap e uma conexão SSE. Nenhum dos dois tem a ver
// com o auto-reveal de spoiler, e ambos custam caro em jsdom.
vi.mock("../chat-input", () => ({
  ChatInput: () => <div data-testid="chat-input" />,
}));
vi.mock("@/hooks/use-chat-sse", () => ({
  useChatSSE: () => ({ connected: true }),
}));
vi.mock("@/hooks/use-typing-indicator", () => ({
  useTypingIndicator: () => ({ sendTyping: vi.fn(), typingUsers: [] }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get: vi.fn() } };
});

import { api } from "@/lib/api";
import { ChatContainer } from "../chat-container";
import { GroupProvider } from "@/lib/contexts/group-context";
import { QueryWrapper } from "@/test-utils/query";
import { useChatStore } from "@/stores/chat-store";
import type { GroupDetailResponse } from "@/lib/types/group";
import { makeMessage } from "./helpers";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

// A sentinela de scroll infinito da lista observa interseção; jsdom não tem.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const ME = "u-me";
const OTHER = "u-other";
const SPOILER_TEXT = "O mordomo é o assassino";

const group: GroupDetailResponse = {
  id: "g1",
  name: "Clubinho",
  description: null,
  photo_url: null,
  invite_code: null,
  max_members: 8,
  member_count: 2,
  members: [
    {
      user_id: ME,
      username: "eu",
      display_name: "Eu",
      avatar_url: null,
      role: "member",
      joined_at: "2026-01-01T00:00:00Z",
    },
  ],
  current_user_id: ME,
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

const spoilerFromOther = makeMessage({
  id: "m-spoiler",
  author: {
    user_id: OTHER,
    username: "outra",
    display_name: "Outra",
    avatar_url: null,
  },
  content_text: SPOILER_TEXT,
  is_spoiler: true,
  spoiler_chapter: 3,
  created_at: "2026-01-02T10:00:00Z",
});

/** Marcador de capítulo que o próprio usuário postou — a fonte do viewerChapter. */
const myChapterMarker = makeMessage({
  id: "m-marker",
  author: {
    user_id: ME,
    username: "eu",
    display_name: "Eu",
    avatar_url: null,
  },
  content_type: "chapter_marker",
  content_text: "Capítulo 5",
  reference_type: "chapter",
  reference_value: "5",
  created_at: "2026-01-02T09:00:00Z",
});

/**
 * A lista de mensagens e a busca do capítulo do leitor batem no mesmo endpoint
 * com querystrings diferentes; só a segunda leva `reference_type=chapter`.
 */
function respondWith(chapterMarkers: ReturnType<typeof makeMessage>[]) {
  get.mockImplementation(async (path: string) => {
    if (path.includes("reference_type=chapter")) {
      return { messages: chapterMarkers, next_cursor: null };
    }
    return { messages: [spoilerFromOther], next_cursor: null };
  });
}

function renderChat() {
  return render(
    <QueryWrapper>
      <GroupProvider group={group} refetch={vi.fn()}>
        <ChatContainer groupId="g1" />
      </GroupProvider>
    </QueryWrapper>,
  );
}

// A lista virtualizada só monta as linhas que couberem no viewport, e jsdom não
// faz layout: sem o harness o container tem altura 0, nenhuma linha é montada, e
// estes testes falhariam por ausência de DOM em vez de por comportamento.
let layout: VirtualLayoutHarness;

beforeEach(() => {
  vi.clearAllMocks();
  useChatStore.getState().reset();
  layout = installVirtualLayout();
});

afterEach(() => {
  layout.restore();
});

describe("ChatContainer — auto-reveal de spoiler", () => {
  it("revela sem clique o spoiler de capítulo que o leitor já passou", async () => {
    respondWith([myChapterMarker]);

    renderChat();

    // Sem clique nenhum: o texto fica legível porque o leitor está no capítulo
    // 5 e o spoiler é do 3. Coberto, ele existiria no DOM só sob um
    // `aria-hidden` — por isso a asserção é sobre o ancestral, não sobre estar
    // na árvore.
    await waitFor(() => {
      const content = screen.getByText(SPOILER_TEXT);
      expect(content.closest("[aria-hidden='true']")).toBeNull();
    });
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).not.toBeInTheDocument();
  });

  it("mantém coberto o spoiler de capítulo à frente do leitor", async () => {
    respondWith([
      makeMessage({
        ...myChapterMarker,
        reference_value: "2",
        content_text: "Capítulo 2",
      }),
    ]);

    renderChat();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /revelar spoiler/i }),
      ).toBeInTheDocument();
    });
  });

  it("mantém coberto quando o leitor nunca marcou capítulo", async () => {
    respondWith([]);

    renderChat();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /revelar spoiler/i }),
      ).toBeInTheDocument();
    });
  });
});
