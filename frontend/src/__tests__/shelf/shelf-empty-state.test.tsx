import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShelfEmptyState } from "@/components/shelf/shelf-empty-state";

describe("ShelfEmptyState", () => {
  it("shows the empty message", () => {
    render(<ShelfEmptyState />);
    expect(
      screen.getByText("Nenhum livro na estante ainda"),
    ).toBeInTheDocument();
  });

  it("does not show CTA without showCta prop", () => {
    render(<ShelfEmptyState />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows CTA link when showCta and groupId are provided", () => {
    render(<ShelfEmptyState showCta groupId="abc-123" />);
    const link = screen.getByRole("link", { name: /rodada/i });
    expect(link).toHaveAttribute("href", "/groups/abc-123/round");
  });
});
