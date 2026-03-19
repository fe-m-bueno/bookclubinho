import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatSkeleton } from "../chat-skeleton";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ChatSkeleton", () => {
  it("renders the accessible loading container", () => {
    render(<ChatSkeleton />);
    const container = screen.getByLabelText("Carregando mensagens");
    expect(container).toBeInTheDocument();
  });

  it("sets aria-busy='true' on the container", () => {
    render(<ChatSkeleton />);
    const container = screen.getByLabelText("Carregando mensagens");
    expect(container).toHaveAttribute("aria-busy", "true");
  });

  it("renders five skeleton bubble rows", () => {
    const { container } = render(<ChatSkeleton />);
    // Each BubbleSkeleton renders one Skeleton with h-10 (the bubble itself).
    // Five bubbles → five h-10 skeleton elements.
    const bubbles = container.querySelectorAll(".h-10");
    expect(bubbles).toHaveLength(5);
  });

  it("renders both left-aligned and right-aligned bubbles", () => {
    const { container } = render(<ChatSkeleton />);
    // Left bubbles sit in flex-row rows; right bubbles in flex-row-reverse rows.
    const leftRows = container.querySelectorAll(".flex-row");
    const rightRows = container.querySelectorAll(".flex-row-reverse");
    expect(leftRows.length).toBeGreaterThan(0);
    expect(rightRows.length).toBeGreaterThan(0);
  });

  it("renders avatar placeholder circles only for left-side bubbles", () => {
    const { container } = render(<ChatSkeleton />);
    // Left bubbles include a rounded-full skeleton for the avatar.
    // There are 3 left bubbles in the fixture, so expect 3 avatar skeletons.
    const avatars = container.querySelectorAll(".rounded-full");
    expect(avatars).toHaveLength(3);
  });

  it("renders name placeholder skeletons for left-side bubbles", () => {
    const { container } = render(<ChatSkeleton />);
    // Left bubbles include a small h-3 skeleton for the sender name.
    const nameSkeletons = container.querySelectorAll(".h-3");
    expect(nameSkeletons).toHaveLength(3);
  });

  it("does not render any real text content (pure skeleton)", () => {
    const { container } = render(<ChatSkeleton />);
    // The skeleton must contain no visible text — all content is CSS-only
    // placeholder shapes.
    expect(container.textContent?.trim()).toBe("");
  });
});
