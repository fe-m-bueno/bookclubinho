import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FloatingTimerButton } from "../floating-timer-button";
import { useTimerStore } from "@/stores/use-timer-store";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

// Mock tick-store to avoid setInterval in tests
vi.mock("@/stores/tick-store", () => ({
  subscribeTick: () => () => {},
  getTickSnapshot: () => 0,
  getServerSnapshot: () => 0,
}));

// Mock fetch for session verification
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

beforeEach(() => {
  useTimerStore.setState({
    status: "idle",
    sessionId: null,
    roundId: null,
    groupId: null,
    bookTitle: null,
    bookCoverUrl: null,
    startedAtMs: null,
    pausedElapsedMs: 0,
    expanded: false,
    roundContext: null,
  });
});

describe("FloatingTimerButton", () => {
  it("renders FAB with Timer icon when idle", () => {
    render(<FloatingTimerButton />);
    expect(screen.getByLabelText("Timer de leitura")).toBeInTheDocument();
  });

  it("shows toast when clicking FAB without round context while idle", async () => {
    const { toast } = await import("sonner");
    render(<FloatingTimerButton />);
    fireEvent.click(screen.getByLabelText("Timer de leitura"));
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining("rodada em fase de leitura"),
    );
  });

  it("shows elapsed time on FAB when timer is running", () => {
    useTimerStore.setState({
      status: "running",
      sessionId: "sess-1",
      startedAtMs: Date.now() - 65_000, // 1m5s
      pausedElapsedMs: 0,
    });

    render(<FloatingTimerButton />);
    // FAB shows elapsed — should have MM:SS format
    expect(screen.getByLabelText("Timer de leitura")).toBeInTheDocument();
  });

  it("toggles expanded when clicking FAB while running", () => {
    useTimerStore.setState({ status: "running", sessionId: "sess-1", startedAtMs: Date.now() });

    render(<FloatingTimerButton />);
    fireEvent.click(screen.getByLabelText("Timer de leitura"));

    expect(useTimerStore.getState().expanded).toBe(true);
  });

  it("shows expanded panel with book title and controls when expanded", () => {
    useTimerStore.setState({
      status: "running",
      sessionId: "sess-1",
      bookTitle: "Dom Casmurro",
      bookCoverUrl: null,
      startedAtMs: Date.now(),
      pausedElapsedMs: 0,
      expanded: true,
    });

    render(<FloatingTimerButton />);
    expect(screen.getByText("Dom Casmurro")).toBeInTheDocument();
    expect(screen.getByLabelText("Pausar")).toBeInTheDocument();
    expect(screen.getByLabelText("Parar sessão")).toBeInTheDocument();
    expect(screen.getByLabelText("Recolher timer")).toBeInTheDocument();
  });

  it("shows Resume button when paused", () => {
    useTimerStore.setState({
      status: "paused",
      sessionId: "sess-1",
      bookTitle: "Livro",
      pausedElapsedMs: 60_000,
      startedAtMs: null,
      expanded: true,
    });

    render(<FloatingTimerButton />);
    expect(screen.getByLabelText("Retomar")).toBeInTheDocument();
    expect(screen.getByText("Pausado")).toBeInTheDocument();
  });

  it("collapses panel when clicking ChevronDown", () => {
    useTimerStore.setState({
      status: "running",
      sessionId: "sess-1",
      bookTitle: "Livro",
      startedAtMs: Date.now(),
      expanded: true,
    });

    render(<FloatingTimerButton />);
    fireEvent.click(screen.getByLabelText("Recolher timer"));
    expect(useTimerStore.getState().expanded).toBe(false);
  });
});
