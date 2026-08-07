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

  it("reserva espaço para a atribuição, que é absolute e não empurra nada", () => {
    const el = root();

    expect(el.className).toMatch(/\bpy-\d+\b/);
    expect(screen.getByText("bookclubinho").className).toContain("absolute");
  });
});
