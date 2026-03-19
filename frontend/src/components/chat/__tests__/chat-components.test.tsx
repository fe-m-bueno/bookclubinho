import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("framer-motion");

import { MessageReactions } from "../message-reactions";
import { ChapterMarkerCard } from "../chapter-marker-card";
import { PageMarkerCard } from "../page-marker-card";
import { QuoteCard } from "../quote-card";
import { VideoEmbedCard } from "../video-embed-card";
import { ChapterFilterChip } from "../chapter-filter-chip";
import { SpoilerConfirmDialog } from "../spoiler-confirm-dialog";
import { SpoilerOverlay } from "../spoiler-overlay";
import { useChatStore } from "@/stores/chat-store";
import { makeMessage, makeReaction } from "./helpers";

// ---------------------------------------------------------------------------
// MessageReactions
// ---------------------------------------------------------------------------

describe("MessageReactions", () => {
  it("renders nothing when reactions array is empty", () => {
    const { container } = render(
      <MessageReactions
        reactions={[]}
        messageId="m1"
        isOwn={false}
        onToggle={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders reaction pills with emoji and count", () => {
    render(
      <MessageReactions
        reactions={[makeReaction({ emoji: "👍", count: 3 })]}
        messageId="m1"
        isOwn={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("👍")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onToggle with the correct emoji when clicked", () => {
    const onToggle = vi.fn();
    render(
      <MessageReactions
        reactions={[makeReaction({ emoji: "😂", count: 2 })]}
        messageId="m1"
        isOwn={false}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /😂/ }));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith("😂");
  });

  it("marks did_i_react reactions as aria-pressed", () => {
    render(
      <MessageReactions
        reactions={[makeReaction({ emoji: "❤️", count: 1, did_i_react: true })]}
        messageId="m1"
        isOwn={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /❤️/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("skips reactions with count 0", () => {
    render(
      <MessageReactions
        reactions={[makeReaction({ emoji: "🔥", count: 0 })]}
        messageId="m1"
        isOwn={false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText("🔥")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChapterMarkerCard
// ---------------------------------------------------------------------------

describe("ChapterMarkerCard", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders author name and chapter reference", () => {
    const msg = makeMessage({
      content_type: "chapter_marker",
      reference_type: "chapter",
      reference_value: "12",
    });
    render(<ChapterMarkerCard message={msg} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("calls setChapterFilter in the store when clicked", () => {
    const msg = makeMessage({
      content_type: "chapter_marker",
      reference_value: "5",
    });
    render(<ChapterMarkerCard message={msg} />);
    fireEvent.click(screen.getByRole("button"));
    expect(useChatStore.getState().chapterFilter).toBe(5);
  });

  it("renders username as fallback when display_name is null", () => {
    const msg = makeMessage({
      content_type: "chapter_marker",
      reference_value: "3",
      author: {
        user_id: "u2",
        username: "bob_99",
        display_name: null,
        avatar_url: null,
      },
    });
    render(<ChapterMarkerCard message={msg} />);
    expect(screen.getByText("bob_99")).toBeInTheDocument();
  });

  it("shows em-dash when reference_value is null", () => {
    const msg = makeMessage({ content_type: "chapter_marker", reference_value: null });
    render(<ChapterMarkerCard message={msg} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// PageMarkerCard
// ---------------------------------------------------------------------------

describe("PageMarkerCard", () => {
  it("renders author name and page reference", () => {
    const msg = makeMessage({
      content_type: "page_marker",
      reference_type: "page",
      reference_value: "142",
    });
    render(<PageMarkerCard message={msg} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("142")).toBeInTheDocument();
    expect(screen.getByText(/está na página/)).toBeInTheDocument();
  });

  it("renders em-dash when reference_value is null", () => {
    const msg = makeMessage({ content_type: "page_marker", reference_value: null });
    render(<PageMarkerCard message={msg} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// QuoteCard
// ---------------------------------------------------------------------------

describe("QuoteCard", () => {
  it("renders quote text and author", () => {
    const msg = makeMessage({
      content_type: "quote",
      content_text: "It is a truth universally acknowledged",
      reference_value: "1",
    });
    render(<QuoteCard message={msg} />);
    expect(
      screen.getByText("It is a truth universally acknowledged"),
    ).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Página 1")).toBeInTheDocument();
  });

  it("hides page reference when reference_value is null", () => {
    const msg = makeMessage({
      content_type: "quote",
      content_text: "Some quote",
      reference_value: null,
    });
    render(<QuoteCard message={msg} />);
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  it("renders author username when display_name is null", () => {
    const msg = makeMessage({
      content_type: "quote",
      content_text: "Hello",
      reference_value: null,
      author: {
        user_id: "u3",
        username: "carol",
        display_name: null,
        avatar_url: null,
      },
    });
    render(<QuoteCard message={msg} />);
    expect(screen.getByText("carol")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// VideoEmbedCard
// ---------------------------------------------------------------------------

describe("VideoEmbedCard", () => {
  it("renders a link that opens in a new tab", () => {
    render(<VideoEmbedCard url="https://x.com/user/status/123" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://x.com/user/status/123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("displays truncated hostname + path", () => {
    render(<VideoEmbedCard url="https://x.com/user/status/123" />);
    expect(screen.getByText("x.com/user/status/123")).toBeInTheDocument();
  });

  it("falls back to raw url when it is not parseable", () => {
    render(<VideoEmbedCard url="not-a-valid-url" />);
    expect(screen.getByText("not-a-valid-url")).toBeInTheDocument();
  });

  it("strips www. prefix from hostname", () => {
    render(<VideoEmbedCard url="https://www.youtube.com/watch?v=abc" />);
    expect(screen.getByText(/youtube\.com/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ChapterFilterChip
// ---------------------------------------------------------------------------

describe("ChapterFilterChip", () => {
  it("renders the chapter number", () => {
    render(<ChapterFilterChip chapter={7} onClear={vi.fn()} />);
    expect(screen.getByText("Capítulo 7")).toBeInTheDocument();
  });

  it("calls onClear when the X button is clicked", () => {
    const onClear = vi.fn();
    render(<ChapterFilterChip chapter={3} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: /remover filtro/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// SpoilerConfirmDialog
// ---------------------------------------------------------------------------

describe("SpoilerConfirmDialog", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("shows chapter numbers in the description when both are provided", () => {
    render(
      <SpoilerConfirmDialog
        open
        onOpenChange={vi.fn()}
        spoilerChapter={10}
        viewerChapter={5}
        messageId="msg-abc"
      />,
    );
    expect(screen.getByText(/capítulo 10/i)).toBeInTheDocument();
    expect(screen.getByText(/capítulo 5/i)).toBeInTheDocument();
  });

  it("shows no-progress message when viewerChapter is null", () => {
    render(
      <SpoilerConfirmDialog
        open
        onOpenChange={vi.fn()}
        spoilerChapter={8}
        viewerChapter={null}
        messageId="msg-xyz"
      />,
    );
    expect(screen.getByText(/não registrou progresso/i)).toBeInTheDocument();
  });

  it("reveals the spoiler in the store when the action button is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <SpoilerConfirmDialog
        open
        onOpenChange={onOpenChange}
        spoilerChapter={3}
        viewerChapter={2}
        messageId="msg-reveal"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sim, revelar/i }));
    expect(useChatStore.getState().isSpoilerRevealed("msg-reveal")).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not reveal when cancel is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <SpoilerConfirmDialog
        open
        onOpenChange={onOpenChange}
        spoilerChapter={3}
        viewerChapter={2}
        messageId="msg-no-reveal"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^não$/i }));
    expect(useChatStore.getState().isSpoilerRevealed("msg-no-reveal")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SpoilerOverlay
// ---------------------------------------------------------------------------

describe("SpoilerOverlay", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders children directly when message is not a spoiler", () => {
    const msg = makeMessage({ is_spoiler: false });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2">
        <span>Secret content</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Secret content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });

  it("renders children directly when the viewer is the author", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 5 });
    // currentUserId === message.author.user_id ("u1")
    render(
      <SpoilerOverlay message={msg} currentUserId="u1">
        <span>Own spoiler</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Own spoiler")).toBeInTheDocument();
  });

  it("auto-reveals when viewerChapter meets or exceeds spoiler chapter", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 5 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={5}>
        <span>Auto revealed</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Auto revealed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });

  it("shows the overlay button when the viewer is behind the spoiler chapter", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 10 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={3}>
        <span>Hidden content</span>
      </SpoilerOverlay>,
    );
    expect(
      screen.getByRole("button", { name: /revelar spoiler/i }),
    ).toBeInTheDocument();
  });

  it("shows chapter label in the overlay", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 7 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={null}>
        <span>Hidden</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText(/Capítulo 7\+/)).toBeInTheDocument();
  });

  it("renders children directly after spoiler is revealed in store", () => {
    const msg = makeMessage({ id: "msg-revealed", is_spoiler: true, spoiler_chapter: 4 });
    useChatStore.getState().revealSpoiler("msg-revealed");
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={1}>
        <span>Now visible</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Now visible")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });
});
