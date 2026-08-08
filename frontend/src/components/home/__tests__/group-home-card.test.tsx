import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GroupHomeCard } from "../group-home-card";
import type { GroupListItem, RoundSummary } from "@/lib/types/group";

const baseGroup: GroupListItem = {
  id: "g1",
  name: "Clube Literário",
  photo_url: null,
  member_count: 4,
  members_preview: [
    { user_id: "u1", display_name: "Alice", avatar_url: null },
    { user_id: "u2", display_name: "Bob", avatar_url: null },
  ],
  current_round: null,
  my_reading_progress: null,
  last_message_preview: null,
  last_activity_at: null,
};

function makeRound(overrides: Partial<RoundSummary> = {}): RoundSummary {
  return {
    id: "r1",
    round_number: 1,
    status: "reading",
    book_title: "O Senhor dos Anéis",
    book_author: "Tolkien",
    book_cover_url: null,
    book_page_count: 500,
    deadline: null,
    needs_my_action: false,
    ...overrides,
  };
}

/** 13/08/2026, meio-dia — os prazos dos testes são relativos a este dia. */
const HOJE = new Date(2026, 7, 13, 12, 0, 0);

describe("GroupHomeCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(HOJE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders group name", () => {
    render(<GroupHomeCard group={baseGroup} />);
    expect(screen.getByText("Clube Literário")).toBeInTheDocument();
  });

  it("shows member count", () => {
    render(<GroupHomeCard group={baseGroup} />);
    expect(screen.getByText("4 membros")).toBeInTheDocument();
  });

  it("leva ao clube", () => {
    render(<GroupHomeCard group={baseGroup} />);
    expect(
      screen.getByRole("link", { name: /Clube Literário/ }),
    ).toHaveAttribute("href", "/groups/g1");
  });

  it("shows round status badge when round present", () => {
    render(<GroupHomeCard group={{ ...baseGroup, current_round: makeRound() }} />);
    expect(screen.getByText("Lendo")).toBeInTheDocument();
  });

  it("shows book title when round has book", () => {
    render(<GroupHomeCard group={{ ...baseGroup, current_round: makeRound() }} />);
    expect(screen.getByText("O Senhor dos Anéis")).toBeInTheDocument();
  });

  it("shows reading progress bar when reading", () => {
    render(
      <GroupHomeCard
        group={{
          ...baseGroup,
          current_round: makeRound(),
          my_reading_progress: {
            current_page: 100,
            total_pages: 200,
            percentage: 50,
          },
        }}
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows last message preview", () => {
    render(
      <GroupHomeCard
        group={{
          ...baseGroup,
          last_message_preview: {
            sender_display_name: "Alice",
            sender_avatar_url: null,
            content_text: "Olá pessoal!",
            content_type: "text",
            created_at: new Date().toISOString(),
          },
        }}
      />,
    );
    expect(screen.getByText(/Olá pessoal!/)).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  describe("prazo da rodada", () => {
    it("mostra quando a rodada fecha", () => {
      // `Round.deadline` existe no banco desde sempre; não chegava ao cliente,
      // então a home não tinha como dizer que a votação fecha amanhã.
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({ deadline: "2026-08-14" }),
          }}
        />,
      );
      expect(screen.getByText("termina amanhã")).toBeInTheDocument();
    });

    it("não inventa prazo quando não há", () => {
      render(
        <GroupHomeCard group={{ ...baseGroup, current_round: makeRound() }} />,
      );
      expect(screen.queryByText(/termina|faltam|atrasad/)).not.toBeInTheDocument();
    });

    it("diz que está atrasado quando o prazo passou", () => {
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({ deadline: "2026-08-10" }),
          }}
        />,
      );
      expect(screen.getByText("3 dias atrasado")).toBeInTheDocument();
    });
  });

  describe("a ação que a fase pede", () => {
    it("votação travada em mim pede o voto", () => {
      // O card em `voting` era um chip cinza "Votando" e nada mais — não
      // pedia nada de ninguém, nem quando a votação esperava só por você.
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({
              status: "voting",
              needs_my_action: true,
              deadline: "2026-08-14",
            }),
          }}
        />,
      );
      expect(screen.getByText("falta seu voto")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Votar" })).toHaveAttribute(
        "href",
        "/groups/g1/round",
      );
    });

    it("quem já votou não é cobrado de novo", () => {
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({
              status: "voting",
              needs_my_action: false,
            }),
          }}
        />,
      );
      expect(screen.queryByText("falta seu voto")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Votar" }),
      ).not.toBeInTheDocument();
    });

    it("indicação travada em mim pede o livro", () => {
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({
              status: "nominating",
              needs_my_action: true,
            }),
          }}
        />,
      );
      expect(
        screen.getByRole("link", { name: "Indicar livro" }),
      ).toBeInTheDocument();
    });

    it("na leitura, a ação é atualizar o progresso", () => {
      render(
        <GroupHomeCard
          group={{ ...baseGroup, current_round: makeRound({ status: "reading" }) }}
        />,
      );
      expect(
        screen.getByRole("link", { name: "Atualizar leitura" }),
      ).toHaveAttribute("href", "/groups/g1/round");
    });
  });

  describe("preview da última mensagem", () => {
    it("não descarta o texto de tipos que não são text/image/gif", () => {
      // Qualquer `content_type` fora dos três virava a palavra "Mensagem",
      // jogando fora o `content_text` que a API já tinha mandado.
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            last_message_preview: {
              sender_display_name: "Alice",
              sender_avatar_url: null,
              content_text: "Capítulo 12",
              content_type: "chapter_marker",
              created_at: new Date().toISOString(),
            },
          }}
        />,
      );
      expect(screen.getByText(/Capítulo 12/)).toBeInTheDocument();
      expect(screen.queryByText(/Mensagem/)).not.toBeInTheDocument();
    });

    it("nunca revela o texto de um spoiler na home", () => {
      // A home é a tela que fica aberta na mesa do bar. O spoiler tem
      // `content_text`, e mostrá-lo aqui furaria o mecanismo inteiro.
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            last_message_preview: {
              sender_display_name: "Alice",
              sender_avatar_url: null,
              content_text: "o mordomo é o assassino",
              content_type: "spoiler",
              created_at: new Date().toISOString(),
            },
          }}
        />,
      );
      expect(
        screen.queryByText(/o mordomo é o assassino/),
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Spoiler/)).toBeInTheDocument();
    });

    it("descreve mídia sem texto", () => {
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            last_message_preview: {
              sender_display_name: "Alice",
              sender_avatar_url: null,
              content_text: null,
              content_type: "image",
              created_at: new Date().toISOString(),
            },
          }}
        />,
      );
      expect(screen.getByText(/Imagem/)).toBeInTheDocument();
    });
  });

  describe("capa do livro", () => {
    it("capa quebrada não vaza o título como texto cru", () => {
      // Sem tratamento de erro, o browser desenha o `alt` no slot de 60×88 —
      // o título do livro aparecia duas vezes, uma delas como texto solto no
      // lugar da imagem.
      render(
        <GroupHomeCard
          group={{
            ...baseGroup,
            current_round: makeRound({
              book_cover_url: "https://exemplo.invalido/capa.jpg",
            }),
          }}
        />,
      );

      const capa = screen.getByRole("img", { name: "O Senhor dos Anéis" });
      fireEvent.error(capa);

      expect(
        screen.queryByRole("img", { name: "O Senhor dos Anéis" }),
      ).not.toBeInTheDocument();
      // O título segue no card, uma vez só, no lugar dele.
      expect(screen.getAllByText("O Senhor dos Anéis")).toHaveLength(1);
    });
  });
});
