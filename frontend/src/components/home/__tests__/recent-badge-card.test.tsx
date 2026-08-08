import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentBadgeCard } from "../recent-badge-card";
import type { BadgeResponse } from "@/lib/types/badge";

function makeBadge(overrides: Partial<BadgeResponse> = {}): BadgeResponse {
  return {
    slug: "founder",
    name: "Fundador",
    description: "Criou um clube",
    emoji: "🏗️",
    category: "social",
    earned_at: new Date().toISOString(),
    group_name: null,
    book_title: null,
    ...overrides,
  };
}

describe("RecentBadgeCard", () => {
  it("diz de que clube veio a conquista", () => {
    // A mesma badge é conquistada uma vez por clube. Sem esta linha a home
    // mostrava "Fundador" duas vezes, em linhas visualmente idênticas — lia
    // como bug de duplicata. O backend já mandava `group_name`; o card é que
    // ignorava o campo.
    render(<RecentBadgeCard badge={makeBadge({ group_name: "Clube de Teste" })} />);

    expect(screen.getByText("Fundador")).toBeInTheDocument();
    expect(screen.getByText("Clube de Teste")).toBeInTheDocument();
  });

  it("badge sem clube não deixa linha vazia", () => {
    const { container } = render(<RecentBadgeCard badge={makeBadge()} />);

    expect(screen.getByText("Fundador")).toBeInTheDocument();
    expect(container.textContent).not.toContain("null");
  });

  it("duas do mesmo tipo se distinguem pelo clube", () => {
    render(
      <>
        <RecentBadgeCard badge={makeBadge({ group_name: "Clube A" })} />
        <RecentBadgeCard badge={makeBadge({ group_name: "Clube B" })} />
      </>,
    );

    expect(screen.getAllByText("Fundador")).toHaveLength(2);
    expect(screen.getByText("Clube A")).toBeInTheDocument();
    expect(screen.getByText("Clube B")).toBeInTheDocument();
  });
});
