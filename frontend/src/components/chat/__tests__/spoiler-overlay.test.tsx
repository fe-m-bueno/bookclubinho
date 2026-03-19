import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("framer-motion");

import { SpoilerOverlay } from "../spoiler-overlay";
import { useChatStore } from "@/stores/chat-store";
import { makeMessage } from "./helpers";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SpoilerOverlay", () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it("renders children directly when is_spoiler is false", () => {
    const msg = makeMessage({ is_spoiler: false });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2">
        <span>Safe content</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Safe content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });

  it("renders children directly when the viewer is the message author", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 5 });
    // currentUserId matches message.author.user_id ("u1")
    render(
      <SpoilerOverlay message={msg} currentUserId="u1">
        <span>Own spoiler</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Own spoiler")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });

  it("shows blur overlay when is_spoiler is true and viewer is not the author", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 10 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={3}>
        <span>Hidden</span>
      </SpoilerOverlay>,
    );
    expect(
      screen.getByRole("button", { name: /revelar spoiler/i }),
    ).toBeInTheDocument();
  });

  it("auto-reveals when viewerChapter equals spoiler_chapter", () => {
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

  it("auto-reveals when viewerChapter exceeds spoiler_chapter", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 5 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={8}>
        <span>Past chapter content</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText("Past chapter content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revelar spoiler/i }),
    ).toBeNull();
  });

  it("does NOT auto-reveal when viewerChapter is below spoiler_chapter", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 10 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={9}>
        <span>Should be hidden</span>
      </SpoilerOverlay>,
    );
    expect(
      screen.getByRole("button", { name: /revelar spoiler/i }),
    ).toBeInTheDocument();
  });

  it("does NOT auto-reveal when viewerChapter is null", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 3 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={null}>
        <span>Null chapter</span>
      </SpoilerOverlay>,
    );
    expect(
      screen.getByRole("button", { name: /revelar spoiler/i }),
    ).toBeInTheDocument();
  });

  it("shows the chapter number in the overlay label", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 7 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={null}>
        <span>Hidden</span>
      </SpoilerOverlay>,
    );
    expect(screen.getByText(/Capítulo 7\+/)).toBeInTheDocument();
  });

  it("renders children after spoiler has been manually revealed in the store", () => {
    const msg = makeMessage({
      id: "msg-store-reveal",
      is_spoiler: true,
      spoiler_chapter: 4,
    });
    useChatStore.getState().revealSpoiler("msg-store-reveal");
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

  it("opens the confirm dialog when the overlay button is clicked", () => {
    const msg = makeMessage({ is_spoiler: true, spoiler_chapter: 6 });
    render(
      <SpoilerOverlay message={msg} currentUserId="u2" viewerChapter={2}>
        <span>Hidden content</span>
      </SpoilerOverlay>,
    );
    const btn = screen.getByRole("button", { name: /revelar spoiler/i });
    fireEvent.click(btn);
    // The SpoilerConfirmDialog should now be open — it renders an AlertDialog
    // with a "Sim, revelar" button when open=true.
    expect(
      screen.getByRole("button", { name: /sim, revelar/i }),
    ).toBeInTheDocument();
  });
});
