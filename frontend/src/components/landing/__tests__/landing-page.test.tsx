import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const motionPropsFilter = ([key]: [string, unknown]) =>
  !["variants", "initial", "animate", "exit", "custom", "transition", "whileHover", "whileTap"].includes(key);

function makeMotionComponent(Tag: string) {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(Object.entries(props).filter(motionPropsFilter));
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
      h1: makeMotionComponent("h1"),
    },
    useReducedMotion: () => false,
  };
});

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

import { LandingPage } from "../landing-page";

/**
 * A landing era `h-dvh overflow-hidden`: em viewport de pouca altura (≲600px,
 * desktop com muitas toolbars ou mobile em landscape) o conteúdo não cabia e,
 * sem scroll, o ornamento de baixo montava em cima da atribuição do rodapé.
 *
 * jsdom não faz layout, então o que dá para garantir aqui é a decisão que
 * evita o corte — a conferência de que o layout continua íntegro foi feita
 * renderizada em 375×667, 1280×577 e 1280×900.
 */
describe("LandingPage — viewport de pouca altura", () => {
  function root() {
    const { container } = render(<LandingPage />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).not.toBeNull();
    return el;
  }

  it("cresce além da viewport em vez de travar a altura", () => {
    const el = root();

    expect(el.className).toContain("min-h-dvh");
    expect(el.className).not.toMatch(/(^|\s)h-dvh(\s|$)/);
  });

  it("não esconde o excedente vertical", () => {
    const el = root();

    // Os livros decorativos são `absolute` e ainda precisam de contenção — mas
    // só na horizontal, senão o scroll vertical volta a sumir.
    expect(el.className).not.toMatch(/(^|\s)overflow-hidden(\s|$)/);
    expect(el.className).toContain("overflow-x-clip");
  });

  it("reserva espaço para o rodapé, que é absolute e não empurra nada", () => {
    const el = root();

    expect(el.className).toMatch(/\bpy-\d+\b/);
    const footer = screen.getByRole("link", { name: "o que é isso?" });
    expect(footer.parentElement?.className).toContain("absolute");
  });
});

/**
 * O ornamento é o que diz, sem texto, que este app é sobre livros. Em 32×48px
 * e a 20–50% de opacidade ele não dizia nada — era um retângulo arredondado
 * repetido seis vezes em qualquer largura. jsdom não desenha nem resolve media
 * query, então o que se garante aqui é a decisão: maiores, com o tratamento
 * que o resto do app usa, e três deles reservados para onde há margem lateral.
 */
describe("LandingPage — ornamento", () => {
  function books() {
    const { container } = render(<LandingPage />);
    return Array.from(
      container.querySelectorAll<HTMLElement>('[aria-hidden="true"].absolute'),
    );
  }

  it("mostra três na tela estreita e seis a partir de lg", () => {
    const all = books();
    const semprevisiveis = all.filter((b) => !b.className.includes("hidden"));

    expect(all).toHaveLength(6);
    expect(semprevisiveis).toHaveLength(3);
    all
      .filter((b) => b.className.includes("hidden"))
      .forEach((b) => expect(b.className).toContain("lg:block"));
  });

  it("usa o tratamento de lombada do app, e não um segundo desenho de livro", () => {
    const { container } = render(<LandingPage />);
    const spines = container.querySelectorAll<HTMLElement>(
      '[style*="perspective(400px)"]',
    );

    expect(spines).toHaveLength(6);
    // 56×80: abaixo disso o detalhe de lombada não sobrevive à opacidade.
    spines.forEach((spine) => {
      expect(spine.className).toContain("w-14");
      expect(spine.className).toContain("h-20");
    });
  });

  /**
   * O véu que mantém o ornamento no fundo estava na camada errada: a mesma
   * `motion.div` que anima `opacity` de 0 a 1 carregava as classes
   * `opacity-*`, e o `style` inline do Framer ganha de qualquer utilitário —
   * os seis livros pediam 20–50% e apareciam a 100%. A opacidade mora na
   * camada de dentro, que só anima `y`.
   */
  it("não pendura a opacidade na camada que o Framer anima", () => {
    books().forEach((book) => {
      expect(book.className).not.toMatch(/\bopacity-\d+\b/);
      const inner = book.firstElementChild as HTMLElement;
      expect(inner.className).toMatch(/\bopacity-\d+\b/);
      expect(inner.className).toMatch(/\bdark:opacity-\d+\b/);
    });
  });

  it("não vaza na horizontal em nenhuma largura", () => {
    const { container } = render(<LandingPage />);
    const root = container.firstElementChild as HTMLElement;

    // Os livros são `absolute` dentro deste container; `overflow-x-clip` é o
    // que impede que a rotação de um livro na borda crie scroll lateral.
    expect(root.className).toContain("overflow-x-clip");
    books().forEach((book) => {
      expect(book.className).toMatch(/\b(left|right)-\[\d+%\]/);
    });
  });
});

/**
 * A landing é uma tela só — a explicação do produto mora no /about. O rodapé
 * é o único caminho até lá; enquanto era a assinatura "bookclubinho", ele
 * parecia clicável e não era, e passou a repetir o nome que agora está no topo.
 */
describe("LandingPage — porta para o /about", () => {
  it("o rodapé leva ao /about", () => {
    render(<LandingPage />);

    const link = screen.getByRole("link", { name: "o que é isso?" });
    expect(link.getAttribute("href")).toBe("/about");
  });

  it("o rodapé alcança o alvo de toque de 44px", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("link", { name: "o que é isso?" }).className,
    ).toContain("min-h-11");
  });

  it("a marca fica no topo, em Fraunces, e não repete no rodapé", () => {
    render(<LandingPage />);

    // O lugar do nome era um ícone de livro do lucide dentro de um quadrado —
    // o mesmo ícone que a UI funcional usa a 16px, ocupando o espaço da marca.
    const marca = screen.getByText("Bookclubinho");
    expect(marca.className).toContain("font-display");
    expect(screen.queryByText("Clube do Livro")).toBeNull();
    expect(screen.queryByRole("link", { name: /bookclubinho/i })).toBeNull();
  });

  it("mantém os dois CTAs e nada além disso", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("link", { name: "Criar meu clube" }).getAttribute("href"),
    ).toBe("/auth/register");
    expect(
      screen.getByRole("link", { name: "Já tenho conta" }).getAttribute("href"),
    ).toBe("/auth/login");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
