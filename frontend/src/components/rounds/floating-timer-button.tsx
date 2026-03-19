"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Timer, Pause, Play, Square, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTimerStore } from "@/stores/use-timer-store";
import { subscribeTick, getTickSnapshot, getServerSnapshot } from "@/stores/tick-store";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { JSON_HEADERS } from "@/hooks/use-auth-submit";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function startSession(roundId: string) {
  await ensureCsrf();
  const res = await fetch(`/api/v1/reading-sessions/start`, {
    method: "POST",
    credentials: "include",
    headers: withCsrf(JSON_HEADERS),
    body: JSON.stringify({ round_id: roundId }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { id: string; started_at: string };
}

async function stopSession(sessionId: string) {
  await ensureCsrf();
  const res = await fetch(`/api/v1/reading-sessions/${sessionId}/stop`, {
    method: "POST",
    credentials: "include",
    headers: withCsrf(JSON_HEADERS),
    body: JSON.stringify({}),
  });
  if (!res.ok) return null;
  return (await res.json()) as { duration_minutes: number | null };
}

export function FloatingTimerButton() {
  const status = useTimerStore((s) => s.status);
  const sessionId = useTimerStore((s) => s.sessionId);
  const bookTitle = useTimerStore((s) => s.bookTitle);
  const bookCoverUrl = useTimerStore((s) => s.bookCoverUrl);
  const startedAtMs = useTimerStore((s) => s.startedAtMs);
  const pausedElapsedMs = useTimerStore((s) => s.pausedElapsedMs);
  const expanded = useTimerStore((s) => s.expanded);
  const roundContext = useTimerStore((s) => s.roundContext);
  // Actions are stable references — extracting individually avoids subscribing to full store
  const startTimer = useTimerStore((s) => s.startTimer);
  const pauseTimer = useTimerStore((s) => s.pauseTimer);
  const resumeTimer = useTimerStore((s) => s.resumeTimer);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const toggleExpanded = useTimerStore((s) => s.toggleExpanded);

  const [starting, setStarting] = useState(false);

  // Only tick (re-render every 1s) when the timer is actively running
  useSyncExternalStore(
    status === "running" ? subscribeTick : () => () => {},
    status === "running" ? getTickSnapshot : () => 0,
    getServerSnapshot,
  );

  const elapsedMs =
    status === "running" && startedAtMs !== null
      ? pausedElapsedMs + (Date.now() - startedAtMs)
      : pausedElapsedMs;

  // Crash recovery: verify server session once on mount if status is not idle
  const checkedRef = useRef(false);
  useEffect(() => {
    if (checkedRef.current || status === "idle" || !sessionId) return;
    checkedRef.current = true;
    const controller = new AbortController();
    fetch(`/api/v1/reading-sessions/${sessionId}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) stopTimer();
      })
      .catch(() => {
        // network error — keep local state, user can retry manually
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFabClick = async () => {
    if (status === "running" || status === "paused") {
      toggleExpanded();
      return;
    }

    if (!roundContext) {
      toast.info("Abra uma rodada em fase de leitura para usar o timer.");
      return;
    }

    setStarting(true);
    const session = await startSession(roundContext.roundId).catch(() => null);
    setStarting(false);

    if (!session) {
      toast.error("Não foi possível iniciar a sessão. Tente novamente.");
      return;
    }

    startTimer({
      sessionId: session.id,
      roundId: roundContext.roundId,
      groupId: roundContext.groupId,
      bookTitle: roundContext.bookTitle,
      bookCoverUrl: roundContext.bookCoverUrl,
      startedAtMs: new Date(session.started_at).getTime(),
    });
  };

  const handleStop = async () => {
    const sid = sessionId;
    const localElapsed = elapsedMs;
    stopTimer();
    if (!sid) return;

    const result = await stopSession(sid).catch(() => null);
    const minutes = result?.duration_minutes ?? Math.round(localElapsed / 60_000);
    const label = minutes === 1 ? "1 minuto" : `${minutes} minutos`;
    toast.success(`Você leu por ${label}!`);
  };

  const handlePauseResume = () => {
    if (status === "running") {
      pauseTimer();
    } else if (status === "paused") {
      resumeTimer();
    }
  };

  const displayTitle = bookTitle ?? roundContext?.bookTitle ?? "Leitura";
  const displayCover = bookCoverUrl ?? roundContext?.bookCoverUrl ?? null;

  return (
    <div className="fixed bottom-20 right-4 z-40">
      <AnimatePresence mode="wait">
        {expanded && status !== "idle" ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 16 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex flex-col gap-3 rounded-2xl bg-card border border-border shadow-xl p-4 w-64"
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              {displayCover ? (
                <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded-sm">
                  <Image
                    src={displayCover}
                    alt={displayTitle}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="h-12 w-8 shrink-0 rounded-sm bg-muted flex items-center justify-center">
                  <Timer className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Lendo</p>
                <p className="text-sm font-medium truncate">{displayTitle}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={toggleExpanded}
                aria-label="Recolher timer"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>

            {/* Elapsed */}
            <div className="text-center">
              <span className="text-3xl font-mono font-bold tabular-nums">
                {formatElapsed(elapsedMs)}
              </span>
              {status === "paused" && (
                <p className="text-xs text-muted-foreground mt-1">Pausado</p>
              )}
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 min-h-[44px]"
                onClick={handlePauseResume}
                aria-label={status === "running" ? "Pausar" : "Retomar"}
              >
                {status === "running" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {status === "running" ? "Pausar" : "Retomar"}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={handleStop}
                aria-label="Parar sessão"
              >
                <Square className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              delay: status === "idle" ? 0.5 : 0,
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            onClick={handleFabClick}
            disabled={starting}
            aria-label="Timer de leitura"
            className="relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70"
          >
            {status === "running" && (
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/40" />
            )}
            {starting ? (
              <span className="h-5 w-5 z-10 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
            ) : status !== "idle" ? (
              <span className="text-xs font-mono font-bold tabular-nums z-10">
                {formatElapsed(elapsedMs)}
              </span>
            ) : (
              <Timer className="h-5 w-5 z-10" />
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
