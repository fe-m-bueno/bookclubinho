"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideEmotionalStatsProps {
  data: WrappedData;
}

interface StatRow {
  emoji: string;
  label: string;
  count: number;
}

function buildRows(stats: WrappedData["emotional_stats"]): StatRow[] {
  return [
    { emoji: "😢", label: "choraram", count: stats.cried_count },
    { emoji: "😍", label: "amaram o livro", count: stats.loved_it_count },
    { emoji: "🥵", label: "sentiram tesão", count: stats.felt_aroused_count },
    { emoji: "🏋️", label: "acharam pesado", count: stats.found_heavy_count },
    { emoji: "📚", label: "querem mais do autor", count: stats.wants_more_count },
  ];
}

export function SlideEmotionalStats({ data }: SlideEmotionalStatsProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const stats = data.emotional_stats;
  const rows = buildRows(stats);
  const total = stats.total_reviews;

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">💭</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Sem reviews ainda</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">
      <motion.div
        className="text-center"
        initial={shouldReduce ? {} : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        <p className="text-sm font-semibold text-foreground/60 uppercase tracking-widest">
          Como o grupo sentiu
        </p>
      </motion.div>

      <div className="space-y-4">
        {rows.map((row, i) => {
          const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return (
            <motion.div
              key={row.label}
              className="space-y-1.5"
              initial={shouldReduce ? {} : { opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                shouldReduce ? { duration: 0 } : { duration: 0.35, delay: i * 0.08 }
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{row.emoji}</span>
                  <span className="text-sm font-medium text-foreground">
                    <span className="font-bold tabular-nums">{pct}%</span> {row.label}
                  </span>
                </div>
                <span className="text-xs text-foreground/50 flex-none">
                  {row.count}/{total}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-foreground/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  animate={{ width: `${pct}%` }}
                  transition={
                    shouldReduce
                      ? { duration: 0 }
                      : { duration: 0.7, delay: i * 0.08, ease: "easeOut" }
                  }
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
