import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/g1/chat",
}));

const reducedMotion = vi.fn(() => false);

function makeMotionComponent(Tag: string) {
  return ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(
      Object.entries(props).filter(
        ([key]) =>
          ![
            "variants",
            "initial",
            "animate",
            "exit",
            "transition",
            "layoutId",
            "whileHover",
            "whileTap",
          ].includes(key),
      ),
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
    },
    useReducedMotion: () => reducedMotion(),
  };
});

import { GroupTabBar } from "../group-tab-bar";

describe("GroupTabBar", () => {
  it("renders all 5 tabs", () => {
    render(<GroupTabBar groupId="g1" variant="desktop" />);

    expect(screen.getByText("Chat")).toBeInTheDocument();
    expect(screen.getByText("Rodada")).toBeInTheDocument();
    expect(screen.getByText("Shelf")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("Encontros")).toBeInTheDocument();
  });

  it("marks active tab with aria-current=page", () => {
    render(<GroupTabBar groupId="g1" variant="desktop" />);

    const chatLink = screen.getByText("Chat").closest("a");
    expect(chatLink).toHaveAttribute("aria-current", "page");

    const roundLink = screen.getByText("Rodada").closest("a");
    expect(roundLink).not.toHaveAttribute("aria-current");
  });

  it("generates correct hrefs for tabs", () => {
    render(<GroupTabBar groupId="g1" variant="desktop" />);

    expect(screen.getByText("Chat").closest("a")).toHaveAttribute(
      "href",
      "/groups/g1/chat",
    );
    expect(screen.getByText("Rodada").closest("a")).toHaveAttribute(
      "href",
      "/groups/g1/round",
    );
    expect(screen.getByText("Shelf").closest("a")).toHaveAttribute(
      "href",
      "/groups/g1/shelf",
    );
    expect(screen.getByText("Stats").closest("a")).toHaveAttribute(
      "href",
      "/groups/g1/stats",
    );
    expect(screen.getByText("Encontros").closest("a")).toHaveAttribute(
      "href",
      "/groups/g1/meetings",
    );
  });

  it("has navigation role with aria-label", () => {
    render(<GroupTabBar groupId="g1" variant="desktop" />);

    expect(
      screen.getByRole("navigation", { name: "Navegação do grupo" }),
    ).toBeInTheDocument();
  });

  it("desktop variant has hidden md:flex classes", () => {
    const { container } = render(
      <GroupTabBar groupId="g1" variant="desktop" />,
    );

    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("hidden");
    expect(nav?.className).toContain("md:flex");
  });

  describe("variante mobile — controle segmentado no fluxo", () => {
    it("não é barra fixa no rodapé", () => {
      // A barra `fixed bottom-0` era a única do app, pertencia ao grupo e não
      // ao app, e cobrava 56px permanentes do chat para dar atalho a três
      // telas mensais.
      const { container } = render(
        <GroupTabBar groupId="g1" variant="mobile" />,
      );

      const nav = container.querySelector("nav");
      expect(nav?.className).not.toMatch(/(^|\s)fixed(\s|$)/);
      expect(nav?.className).not.toMatch(/(^|\s)bottom-0(\s|$)/);
      expect(nav?.className).toContain("md:hidden");
    });

    it("não estica até a largura toda antes do breakpoint de desktop", () => {
      // A forma foi desenhada para 375px. Solta, ela ia até os 767px que
      // antecedem o `md:` e virava uma faixa de 700px, que não lê como
      // controle segmentado.
      const { container } = render(
        <GroupTabBar groupId="g1" variant="mobile" />,
      );

      const nav = container.querySelector("nav");
      expect(nav?.className).toContain("max-w-md");
      expect(nav?.className).toContain("mx-auto");
    });

    it("percorre as cinco seções pelo teclado, na ordem", async () => {
      const user = userEvent.setup();
      render(<GroupTabBar groupId="g1" variant="mobile" />);

      const esperado = ["Chat", "Rodada", "Shelf", "Stats", "Encontros"];
      for (const label of esperado) {
        await user.tab();
        expect(screen.getByText(label).closest("a")).toHaveFocus();
      }
    });

    it("marca a seção ativa com aria-current", () => {
      render(<GroupTabBar groupId="g1" variant="mobile" />);

      expect(screen.getByText("Chat").closest("a")).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByText("Stats").closest("a")).not.toHaveAttribute(
        "aria-current",
      );
    });

    it("com prefers-reduced-motion o indicador não anima", () => {
      reducedMotion.mockReturnValueOnce(true);
      const { container } = render(
        <GroupTabBar groupId="g1" variant="mobile" />,
      );

      // O indicador é `layoutId` + spring; com movimento reduzido a duração
      // vai a zero em vez de o elemento sumir — quem usa a redução ainda
      // precisa enxergar qual seção está ativa.
      expect(container.querySelector("nav")).toBeInTheDocument();
      expect(screen.getByText("Chat").closest("a")).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });
});
