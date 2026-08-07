import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { GroupDetailResponse } from "@/lib/types/group";

const group: GroupDetailResponse = {
  id: "g1",
  name: "Clube Literário",
  description: null,
  photo_url: null,
  invite_code: "ABC123",
  max_members: 8,
  member_count: 1,
  members: [
    {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      role: "admin",
      joined_at: "2026-01-01T00:00:00Z",
    },
  ],
  current_user_id: "u1",
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/g1/chat",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/hooks/use-group-detail", () => ({
  useGroupDetail: () => ({
    group,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-meetings-badge", () => ({
  useMeetingsBadge: () => false,
}));

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/stores/use-timer-store", () => ({
  useTimerStore: () => false,
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    motion: {
      div: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
      span: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
    },
    useReducedMotion: () => false,
  };
});

import { GroupLayoutShell } from "../group-layout-shell";

/**
 * Home é raiz, grupo é pilha. A barra inferior do grupo morreu: era a única
 * barra fixa do app, cobrava 56px permanentes do chat — a tela diária — para
 * dar atalho a três telas mensais, e não oferecia caminho de volta.
 */
describe("GroupLayoutShell — modelo de pilha", () => {
  function renderShell() {
    return render(
      <GroupLayoutShell groupId="g1">
        <div data-testid="conteudo">conteúdo</div>
      </GroupLayoutShell>,
    );
  }

  it("não deixa nenhum elemento fixo no rodapé", () => {
    const { container } = renderShell();

    const fixos = Array.from(container.querySelectorAll("*")).filter((el) =>
      /(^|\s)fixed(\s|$)/.test((el.className || "").toString()),
    );

    expect(fixos).toEqual([]);
  });

  it("o main não reserva mais a faixa da barra que não existe", () => {
    const { container } = renderShell();

    const main = container.querySelector("main");
    expect(main?.className).not.toMatch(/(^|\s)pb-20(\s|$)/);
  });

  it("o main divide a altura em coluna, com min-h-0", () => {
    const { container } = renderShell();

    // Sem `min-h-0` um filho `flex-1` cresce com o conteúdo e empurra a
    // página: era o que tirava o campo de escrever do chat da tela.
    const main = container.querySelector("main");
    expect(main?.className).toContain("flex-col");
    expect(main?.className).toContain("min-h-0");
  });

  it("oferece a volta para a home a partir de dentro do grupo", () => {
    renderShell();

    expect(
      screen.getByRole("link", { name: "Voltar para o início" }),
    ).toHaveAttribute("href", "/");
  });

  it("o controle segmentado vem antes do conteúdo, dentro da área rolável", () => {
    const { container } = renderShell();

    // Dentro da área rolável — e não acima dela — é o que o faz sair de cena
    // ao rolar Estante, Números e Encontros, e seguir à vista no chat, que
    // não rola.
    const main = container.querySelector("main");
    const nav = main?.querySelector("nav");
    if (!nav) throw new Error("controle segmentado não está dentro do main");

    const posicao = nav.compareDocumentPosition(
      screen.getByTestId("conteudo"),
    );
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
