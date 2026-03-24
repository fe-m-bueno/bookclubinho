import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import type { ChatMessage } from "@/lib/types/chat";

vi.mock("framer-motion");

// ReactionPicker is now rendered in ChatContainer, not MessageBubble.
// These tests cover MessageBubble in isolation, so no ReactionPicker mock needed.

// ---------------------------------------------------------------------------
// Mock radix-ui ContextMenu — context menus don't work in jsdom without a
// real pointer event dispatch, and we're not testing the context menu here.
// ---------------------------------------------------------------------------
vi.mock("radix-ui", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  // Minimal stubs for ContextMenu (no pointer events in jsdom)
  const stubContextMenu = {
    Root: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Trigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Content: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    Item: ({
      children,
      onSelect,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
    }) => React.createElement("button", { onClick: onSelect }, children),
    Separator: () => React.createElement("hr"),
  };

  return {
    ...actual,
    ContextMenu: stubContextMenu,
  };
});

// jsdom returns zeros for getBoundingClientRect; stub it so handleReact computes coords
beforeAll(() => {
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    top: 100,
    bottom: 120,
    left: 16,
    right: 200,
    width: 184,
    height: 20,
    x: 16,
    y: 100,
    toJSON: () => ({}),
  }));
});

import { MessageBubble } from "../message-bubble";
import { useChatStore } from "@/stores/chat-store";
import { makeMessage } from "./helpers";

const defaultProps = {
  isOwn: false,
  showAvatar: true,
  showName: false,
  currentUserId: "u2",
  onReply: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onToggleReaction: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageBubble", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    vi.clearAllMocks();
  });

  it("renders own message with flex-row-reverse alignment class", () => {
    const msg = makeMessage();
    const { container } = render(
      <MessageBubble {...defaultProps} message={msg} isOwn currentUserId="u1" />,
    );
    // The outer row div should have flex-row-reverse for own messages
    const row = container.querySelector(".flex-row-reverse");
    expect(row).toBeInTheDocument();
  });

  it("renders other's message with flex-row alignment class", () => {
    const msg = makeMessage();
    const { container } = render(
      <MessageBubble {...defaultProps} message={msg} isOwn={false} />,
    );
    const row = container.querySelector(".flex-row");
    expect(row).toBeInTheDocument();
  });

  it("applies sage color classes to own message bubble", () => {
    const msg = makeMessage();
    const { container } = render(
      <MessageBubble {...defaultProps} message={msg} isOwn currentUserId="u1" />,
    );
    // Own bubbles use bg-sage-100
    const bubble = container.querySelector(".bg-sage-100");
    expect(bubble).toBeInTheDocument();
  });

  it("applies muted background to other's message bubble", () => {
    const msg = makeMessage();
    const { container } = render(
      <MessageBubble {...defaultProps} message={msg} isOwn={false} />,
    );
    // Others' bubbles use bg-muted
    const bubble = container.querySelector(".bg-muted");
    expect(bubble).toBeInTheDocument();
  });

  it("shows avatar when showAvatar is true and message is not own", () => {
    const msg = makeMessage();
    render(
      <MessageBubble {...defaultProps} message={msg} isOwn={false} showAvatar />,
    );
    // Avatar renders with aria-label matching the author name
    expect(screen.getByLabelText("Alice")).toBeInTheDocument();
  });

  it("hides avatar when showAvatar is false", () => {
    const msg = makeMessage();
    render(
      <MessageBubble
        {...defaultProps}
        message={msg}
        isOwn={false}
        showAvatar={false}
      />,
    );
    expect(screen.queryByLabelText("Alice")).not.toBeInTheDocument();
  });

  it("shows no avatar element for own messages regardless of showAvatar", () => {
    const msg = makeMessage();
    render(
      <MessageBubble
        {...defaultProps}
        message={msg}
        isOwn
        currentUserId="u1"
        showAvatar
      />,
    );
    // Own messages never render an Avatar component
    expect(screen.queryByLabelText("Alice")).not.toBeInTheDocument();
  });

  it("shows sender name when showName is true and message is not own", () => {
    const msg = makeMessage();
    render(
      <MessageBubble {...defaultProps} message={msg} isOwn={false} showName />,
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("hides sender name when showName is false", () => {
    const msg = makeMessage();
    render(
      <MessageBubble
        {...defaultProps}
        message={msg}
        isOwn={false}
        showName={false}
      />,
    );
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("shows '(editada)' when updated_at differs from created_at", () => {
    const msg = makeMessage({
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:05:00Z",
    });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.getByText("(editada)")).toBeInTheDocument();
  });

  it("does not show '(editada)' when updated_at equals created_at", () => {
    const ts = "2026-01-01T10:00:00Z";
    const msg = makeMessage({ created_at: ts, updated_at: ts });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.queryByText("(editada)")).not.toBeInTheDocument();
  });

  it("does not show '(editada)' when updated_at is null", () => {
    const msg = makeMessage({ updated_at: null });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.queryByText("(editada)")).not.toBeInTheDocument();
  });

  it("does not show '(editada)' when message is deleted even if updated_at differs", () => {
    const msg = makeMessage({
      created_at: "2026-01-01T10:00:00Z",
      updated_at: "2026-01-01T10:05:00Z",
      is_deleted: true,
    });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.queryByText("(editada)")).not.toBeInTheDocument();
  });

  it("shows 'Mensagem apagada' when is_deleted is true", () => {
    const msg = makeMessage({ is_deleted: true });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.getByText("Mensagem apagada")).toBeInTheDocument();
  });

  it("does not show 'Mensagem apagada' for a non-deleted message", () => {
    const msg = makeMessage({ is_deleted: false });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.queryByText("Mensagem apagada")).not.toBeInTheDocument();
  });

  it("renders plain text content", () => {
    const msg = makeMessage({ content_text: "Olá pessoal!" });
    render(<MessageBubble {...defaultProps} message={msg} />);
    expect(screen.getByText("Olá pessoal!")).toBeInTheDocument();
  });

  it("renders a timestamp element", () => {
    const ts = "2026-01-15T14:30:00Z";
    const msg = makeMessage({ created_at: ts });
    render(<MessageBubble {...defaultProps} message={msg} />);
    // The <time> element carries the dateTime attribute
    const timeEl = document.querySelector("time");
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute("dateTime", ts);
  });

  it("falls back to username for display when display_name is null", () => {
    const msg = makeMessage({
      author: {
        user_id: "u3",
        username: "bob_77",
        display_name: null,
        avatar_url: null,
      },
      showName: true,
    } as unknown as Partial<ChatMessage>);
    render(
      <MessageBubble {...defaultProps} message={msg} isOwn={false} showName />,
    );
    expect(screen.getByText("bob_77")).toBeInTheDocument();
  });

  describe("Reagir → openReactionPicker", () => {
    it("calls openReactionPicker on the store when 'Reagir' is clicked", () => {
      const msg = makeMessage();
      render(<MessageBubble {...defaultProps} message={msg} />);
      fireEvent.click(screen.getByText("Reagir"));
      const state = useChatStore.getState().reactionPickerState;
      expect(state).not.toBeNull();
      expect(state?.messageId).toBe("msg-1");
    });

    it("sets isOwn=true for own messages", () => {
      const msg = makeMessage();
      render(
        <MessageBubble {...defaultProps} message={msg} isOwn currentUserId="u1" />,
      );
      fireEvent.click(screen.getByText("Reagir"));
      expect(useChatStore.getState().reactionPickerState?.isOwn).toBe(true);
    });

    it("sets isOwn=false for others' messages", () => {
      const msg = makeMessage();
      render(<MessageBubble {...defaultProps} message={msg} isOwn={false} />);
      fireEvent.click(screen.getByText("Reagir"));
      expect(useChatStore.getState().reactionPickerState?.isOwn).toBe(false);
    });
  });
});
