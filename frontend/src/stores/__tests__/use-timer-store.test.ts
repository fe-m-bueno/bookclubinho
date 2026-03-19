import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

vi.stubGlobal("localStorage", localStorageMock);

// Import after mocking
const { useTimerStore } = await import("../use-timer-store");

beforeEach(() => {
  localStorageMock.clear();
  // Reset store to idle state
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

describe("useTimerStore", () => {
  it("starts in idle state", () => {
    const { status } = useTimerStore.getState();
    expect(status).toBe("idle");
  });

  it("startTimer transitions to running and sets session data", () => {
    useTimerStore.getState().startTimer({
      sessionId: "sess-1",
      roundId: "round-1",
      groupId: "group-1",
      bookTitle: "Dom Casmurro",
      bookCoverUrl: "https://example.com/cover.jpg",
    });

    const state = useTimerStore.getState();
    expect(state.status).toBe("running");
    expect(state.sessionId).toBe("sess-1");
    expect(state.roundId).toBe("round-1");
    expect(state.bookTitle).toBe("Dom Casmurro");
    expect(state.startedAtMs).toBeTruthy();
    expect(state.pausedElapsedMs).toBe(0);
    expect(state.expanded).toBe(true);
  });

  it("pauseTimer transitions running to paused and accumulates elapsed", () => {
    const startMs = Date.now() - 10_000; // 10s ago
    useTimerStore.setState({ status: "running", startedAtMs: startMs, pausedElapsedMs: 0 });

    useTimerStore.getState().pauseTimer();

    const state = useTimerStore.getState();
    expect(state.status).toBe("paused");
    expect(state.startedAtMs).toBeNull();
    expect(state.pausedElapsedMs).toBeGreaterThanOrEqual(9_000);
  });

  it("pauseTimer is a no-op when not running", () => {
    useTimerStore.setState({ status: "paused", pausedElapsedMs: 5000 });
    useTimerStore.getState().pauseTimer();
    expect(useTimerStore.getState().status).toBe("paused");
    expect(useTimerStore.getState().pausedElapsedMs).toBe(5000);
  });

  it("resumeTimer transitions paused to running", () => {
    useTimerStore.setState({ status: "paused", pausedElapsedMs: 5000 });
    useTimerStore.getState().resumeTimer();

    const state = useTimerStore.getState();
    expect(state.status).toBe("running");
    expect(state.startedAtMs).toBeTruthy();
  });

  it("resumeTimer is a no-op when not paused", () => {
    useTimerStore.setState({ status: "idle" });
    useTimerStore.getState().resumeTimer();
    expect(useTimerStore.getState().status).toBe("idle");
  });

  it("stopTimer resets all session state", () => {
    useTimerStore.setState({
      status: "running",
      sessionId: "sess-1",
      roundId: "round-1",
      groupId: "group-1",
      bookTitle: "Dom Casmurro",
      startedAtMs: Date.now(),
      pausedElapsedMs: 3000,
      expanded: true,
    });

    useTimerStore.getState().stopTimer();

    const state = useTimerStore.getState();
    expect(state.status).toBe("idle");
    expect(state.sessionId).toBeNull();
    expect(state.roundId).toBeNull();
    expect(state.expanded).toBe(false);
    expect(state.pausedElapsedMs).toBe(0);
  });

  it("toggleExpanded flips expanded state", () => {
    useTimerStore.setState({ expanded: false });
    useTimerStore.getState().toggleExpanded();
    expect(useTimerStore.getState().expanded).toBe(true);
    useTimerStore.getState().toggleExpanded();
    expect(useTimerStore.getState().expanded).toBe(false);
  });

  it("setRoundContext stores context", () => {
    const ctx = {
      roundId: "r1",
      groupId: "g1",
      bookTitle: "Test",
      bookCoverUrl: null,
    };
    useTimerStore.getState().setRoundContext(ctx);
    expect(useTimerStore.getState().roundContext).toEqual(ctx);
  });

  it("setRoundContext can clear context with null", () => {
    useTimerStore.setState({ roundContext: { roundId: "r1", groupId: "g1", bookTitle: null, bookCoverUrl: null } });
    useTimerStore.getState().setRoundContext(null);
    expect(useTimerStore.getState().roundContext).toBeNull();
  });

  it("persistToStorage writes to localStorage", () => {
    useTimerStore.setState({
      status: "running",
      sessionId: "sess-1",
      roundId: "round-1",
      groupId: "group-1",
      bookTitle: "Livro",
      bookCoverUrl: null,
      startedAtMs: 1000,
      pausedElapsedMs: 0,
    });

    useTimerStore.getState().persistToStorage();

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "bookclub:timer-state",
      expect.stringContaining('"sessionId":"sess-1"'),
    );
  });

  it("clearStorage removes from localStorage", () => {
    useTimerStore.getState().clearStorage();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("bookclub:timer-state");
  });

  it("stopTimer calls clearStorage", () => {
    const spy = vi.spyOn(useTimerStore.getState(), "clearStorage");
    useTimerStore.getState().stopTimer();
    expect(spy).toHaveBeenCalled();
  });
});
