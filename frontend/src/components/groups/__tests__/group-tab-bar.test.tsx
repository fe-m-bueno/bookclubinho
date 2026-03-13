import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/g1/chat",
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    motion: {
      div: ({
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
        return React.createElement("div", htmlProps, children);
      },
    },
    useReducedMotion: () => false,
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

  it("mobile variant has fixed bottom classes", () => {
    const { container } = render(
      <GroupTabBar groupId="g1" variant="mobile" />,
    );

    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("fixed");
    expect(nav?.className).toContain("bottom-0");
    expect(nav?.className).toContain("md:hidden");
  });
});
