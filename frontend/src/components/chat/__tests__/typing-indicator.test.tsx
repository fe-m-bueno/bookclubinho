import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("framer-motion");

import { TypingIndicator } from "../typing-indicator";

// ---------------------------------------------------------------------------
// Shared factory
// ---------------------------------------------------------------------------

function makeUser(
  id: string,
  displayName: string,
  avatarUrl = "",
) {
  return { userId: id, displayName, avatarUrl };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TypingIndicator", () => {
  it("renders nothing when users array is empty", () => {
    const { container } = render(<TypingIndicator users={[]} />);
    // AnimatePresence renders its children conditionally; with 0 users the
    // inner motion.div is never mounted, so the container stays empty.
    expect(container.firstChild).toBeNull();
  });

  it("shows '{name} está escrevendo' for exactly 1 typing user", () => {
    render(<TypingIndicator users={[makeUser("u1", "Alice")]} />);
    expect(screen.getByText(/Alice está escrevendo/)).toBeInTheDocument();
  });

  it("shows 'Alguém está escrevendo' when displayName is empty string", () => {
    render(<TypingIndicator users={[makeUser("u1", "")]} />);
    expect(screen.getByText(/Alguém está escrevendo/)).toBeInTheDocument();
  });

  it("shows '{name1} e {name2} estão escrevendo' for 2 typing users", () => {
    render(
      <TypingIndicator
        users={[makeUser("u1", "Alice"), makeUser("u2", "Bob")]}
      />,
    );
    expect(
      screen.getByText(/Alice e Bob estão escrevendo/),
    ).toBeInTheDocument();
  });

  it("shows '{name1}, {name2} e {name3} estão escrevendo' for 3 typing users", () => {
    render(
      <TypingIndicator
        users={[
          makeUser("u1", "Alice"),
          makeUser("u2", "Bob"),
          makeUser("u3", "Carol"),
        ]}
      />,
    );
    expect(
      screen.getByText(/Alice, Bob e Carol estão escrevendo/),
    ).toBeInTheDocument();
  });

  it("renders three animated dot spans when there is at least 1 typing user", () => {
    const { container } = render(
      <TypingIndicator users={[makeUser("u1", "Alice")]} />,
    );
    // TypingDots renders 3 spans with animate-bounce class
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots).toHaveLength(3);
  });

  it("renders avatar initials for users without an avatar URL", () => {
    render(<TypingIndicator users={[makeUser("u1", "Alice", "")]} />);
    // The initial letter of the display name should appear inside the avatar div
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("renders an img tag when a user has an avatar URL", () => {
    const { container } = render(
      <TypingIndicator
        users={[makeUser("u1", "Alice", "https://example.com/avatar.png")]}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
    expect(img).toHaveAttribute("alt", "Alice");
  });

  it("caps the avatar list at 3 users even when more than 3 are typing", () => {
    const { container } = render(
      <TypingIndicator
        users={[
          makeUser("u1", "Alice"),
          makeUser("u2", "Bob"),
          makeUser("u3", "Carol"),
          makeUser("u4", "Dave"),
        ]}
      />,
    );
    // Each avatar occupies one child div inside the -space-x-1 container
    const avatarWrapper = container.querySelector(".\\-space-x-1");
    expect(avatarWrapper?.children).toHaveLength(3);
  });
});
