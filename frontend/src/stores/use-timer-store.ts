import { create } from "zustand";

const STORAGE_KEY = "bookclub:timer-state";

interface RoundContext {
  roundId: string;
  groupId: string;
  bookTitle: string | null;
  bookCoverUrl: string | null;
}

interface PersistedState {
  status: "idle" | "running" | "paused";
  sessionId: string | null;
  roundId: string | null;
  groupId: string | null;
  bookTitle: string | null;
  bookCoverUrl: string | null;
  startedAtMs: number | null;
  pausedElapsedMs: number;
}

interface TimerState extends PersistedState {
  roundContext: RoundContext | null;
  expanded: boolean;

  startTimer: (params: {
    sessionId: string;
    roundId: string;
    groupId: string;
    bookTitle: string | null;
    bookCoverUrl: string | null;
    startedAtMs?: number;
  }) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  toggleExpanded: () => void;
  setRoundContext: (ctx: RoundContext | null) => void;
  persistToStorage: () => void;
  restoreFromStorage: () => boolean;
  clearStorage: () => void;
}

function loadFromStorage(): Partial<PersistedState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return {};
  }
}

const saved = loadFromStorage();

export const useTimerStore = create<TimerState>()((set, get) => ({
  // Restore from localStorage on init
  status: saved.status ?? "idle",
  sessionId: saved.sessionId ?? null,
  roundId: saved.roundId ?? null,
  groupId: saved.groupId ?? null,
  bookTitle: saved.bookTitle ?? null,
  bookCoverUrl: saved.bookCoverUrl ?? null,
  startedAtMs: saved.startedAtMs ?? null,
  pausedElapsedMs: saved.pausedElapsedMs ?? 0,
  roundContext: null,
  expanded: false,

  startTimer: ({ sessionId, roundId, groupId, bookTitle, bookCoverUrl, startedAtMs }) => {
    set({
      status: "running",
      sessionId,
      roundId,
      groupId,
      bookTitle,
      bookCoverUrl,
      startedAtMs: startedAtMs ?? Date.now(),
      pausedElapsedMs: 0,
      expanded: true,
    });
    get().persistToStorage();
  },

  pauseTimer: () => {
    const { startedAtMs, pausedElapsedMs, status } = get();
    if (status !== "running" || startedAtMs === null) return;
    const newElapsed = pausedElapsedMs + (Date.now() - startedAtMs);
    set({ status: "paused", startedAtMs: null, pausedElapsedMs: newElapsed });
    get().persistToStorage();
  },

  resumeTimer: () => {
    const { status } = get();
    if (status !== "paused") return;
    set({ status: "running", startedAtMs: Date.now() });
    get().persistToStorage();
  },

  stopTimer: () => {
    set({
      status: "idle",
      sessionId: null,
      roundId: null,
      groupId: null,
      bookTitle: null,
      bookCoverUrl: null,
      startedAtMs: null,
      pausedElapsedMs: 0,
      expanded: false,
    });
    get().clearStorage();
  },

  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),

  setRoundContext: (ctx) => set({ roundContext: ctx }),

  persistToStorage: () => {
    if (typeof window === "undefined") return;
    const { status, sessionId, roundId, groupId, bookTitle, bookCoverUrl, startedAtMs, pausedElapsedMs } = get();
    const payload: PersistedState = {
      status,
      sessionId,
      roundId,
      groupId,
      bookTitle,
      bookCoverUrl,
      startedAtMs,
      pausedElapsedMs,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // quota exceeded — silently ignore
    }
  },

  restoreFromStorage: () => {
    const data = loadFromStorage();
    if (!data.status || data.status === "idle") return false;
    set({
      status: data.status,
      sessionId: data.sessionId ?? null,
      roundId: data.roundId ?? null,
      groupId: data.groupId ?? null,
      bookTitle: data.bookTitle ?? null,
      bookCoverUrl: data.bookCoverUrl ?? null,
      startedAtMs: data.startedAtMs ?? null,
      pausedElapsedMs: data.pausedElapsedMs ?? 0,
    });
    return true;
  },

  clearStorage: () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  },
}));

// Auto-persist every 30s while running, using Zustand subscribe (no useEffect)
let persistInterval: ReturnType<typeof setInterval> | null = null;
useTimerStore.subscribe((state) => {
  if (state.status !== "idle" && persistInterval === null) {
    persistInterval = setInterval(
      () => useTimerStore.getState().persistToStorage(),
      30_000,
    );
  }
  if (state.status === "idle" && persistInterval !== null) {
    clearInterval(persistInterval);
    persistInterval = null;
  }
});

// Persist on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () =>
    useTimerStore.getState().persistToStorage(),
  );
}
