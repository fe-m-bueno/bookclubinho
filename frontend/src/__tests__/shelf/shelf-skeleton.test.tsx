import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShelfSkeleton } from "@/components/shelf/shelf-skeleton";

describe("ShelfSkeleton", () => {
  it("renders 8 skeleton cards", () => {
    const { container } = render(<ShelfSkeleton />);
    // Each skeleton card has an aspect-[2/3] div inside a space-y-2 div
    const skeletonCards = container.querySelectorAll(".space-y-2");
    expect(skeletonCards.length).toBe(8);
  });

  it("renders a grid container", () => {
    const { container } = render(<ShelfSkeleton />);
    const grid = container.querySelector(".grid");
    expect(grid).not.toBeNull();
  });
});
