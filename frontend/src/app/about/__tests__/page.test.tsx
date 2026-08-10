import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const motionPropsFilter = ([key]: [string, unknown]) =>
  ![
    "variants",
    "initial",
    "animate",
    "exit",
    "custom",
    "transition",
    "whileHover",
    "whileTap",
    "layout",
  ].includes(key);

function makeMotionComponent(Tag: string) {
  return ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(
      Object.entries(props).filter(motionPropsFilter),
    );
    return React.createElement(Tag, htmlProps, children);
  };
}

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    motion: {
      div: makeMotionComponent("div"),
      span: makeMotionComponent("span"),
      p: makeMotionComponent("p"),
      button: makeMotionComponent("button"),
    },
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    useReducedMotion: () => false,
  };
});

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

// `UpcomingMeetingPill`, dentro do trilho de estado, pede o router. Na página
// ele existe; no jsdom, não.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import AboutPage from "../page";
import { CLUBE_LENDO, CONVERSA, INDICACOES } from "@/components/about/about-fixtures";

/**
 * A /about renderiza os componentes de produção alimentados por fixtures — não
 * capturas de tela. Estes testes existem para travar as duas coisas que essa
 * escolha pode quebrar em silêncio: a demo continuar sendo o componente real,
 * e a demo não virar armadilha de navegação para quem usa teclado ou leitor.
 */
describe("/about", () => {
  it("renderiza sem sessão e sem buscar nada", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /não morre no terceiro mês/i }),
    ).toBeTruthy();
  });

  it("explica as três perguntas de quem chegou por convite", () => {
    render(<AboutPage />);

    const titulos = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);

    expect(titulos).toEqual(["A rodada", "O chat, e o borrão", "O que o app registra"]);
  });

  it("mostra os componentes de verdade, alimentados pelas fixtures", () => {
    const { container } = render(<AboutPage />);

    // O card da home, a votação e a conversa — cada um pelo dado que só o
    // componente real desenha.
    expect(container.textContent).toContain(CLUBE_LENDO.name);
    expect(container.textContent).toContain(INDICACOES[0].book_title);
    expect(container.textContent).toContain(CONVERSA[0].content_text);
  });

  it("segura a mensagem marcada como spoiler", () => {
    const { container } = render(<AboutPage />);
    const spoiler = CONVERSA.find((m) => m.is_spoiler)!;

    // O texto está no DOM (é o que o borrão cobre), mas o aviso do capítulo é
    // o que a página está explicando — sem ele, a demo não demonstra nada.
    expect(container.textContent).toContain(
      `Spoiler do capítulo ${spoiler.spoiler_chapter}`,
    );
  });

  /**
   * As demos têm botões de verdade: votar, revelar spoiler, filtrar capítulo,
   * abrir o clube. Todos apontam para um clube que não existe. `inert` tira o
   * bloco inteiro do foco e da árvore de acessibilidade de uma vez — sem ele,
   * o Tab passearia por ações que não levam a lugar nenhum.
   */
  it("deixa as demos fora do foco e do leitor de tela", () => {
    const { container } = render(<AboutPage />);
    const demos = container.querySelectorAll("figure > div[inert]");

    expect(demos.length).toBe(4);
    demos.forEach((demo) => {
      expect(demo.getAttribute("aria-hidden")).toBe("true");
      expect(demo.querySelectorAll("a, button").length).toBeGreaterThan(0);
    });
  });

  it("cada demo tem legenda — é o que resta dela para quem não vê a tela", () => {
    const { container } = render(<AboutPage />);
    const figuras = container.querySelectorAll("figure");

    expect(figuras.length).toBe(4);
    figuras.forEach((figura) => {
      const legenda = figura.querySelector("figcaption");
      expect(legenda?.textContent?.length ?? 0).toBeGreaterThan(20);
    });
  });

  it("fecha com os dois CTAs da landing", () => {
    render(<AboutPage />);
    const main = screen.getByRole("main");

    expect(
      within(main).getByRole("link", { name: "Criar meu clube" }).getAttribute("href"),
    ).toBe("/auth/register");
    expect(
      within(main).getByRole("link", { name: "Já tenho conta" }).getAttribute("href"),
    ).toBe("/auth/login");
  });
});
