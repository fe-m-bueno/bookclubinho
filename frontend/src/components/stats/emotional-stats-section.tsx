"use client";

import { useReducedMotion, motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmotionalStats } from "@/lib/types/stats";

interface EmotionalStatsSectionProps {
  stats: EmotionalStats;
}

interface StatBar {
  label: string;
  count: number;
}

function buildBars(stats: EmotionalStats): StatBar[] {
  return [
    { label: `do grupo já chorou 😢`, count: stats.cried_count },
    { label: `amou o livro 😍`, count: stats.loved_it_count },
    { label: `sentiu tesão 🥵`, count: stats.felt_aroused_count },
    { label: `achou pesado 🏋️`, count: stats.found_heavy_count },
    { label: `quer mais do autor 📚`, count: stats.wants_more_count },
  ];
}

export function EmotionalStatsSection({ stats }: EmotionalStatsSectionProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  if (stats.total_reviews === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Como o grupo sentiu</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma review ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bars = buildBars(stats);
  const total = stats.total_reviews;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Como o grupo sentiu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {bars.map((bar, i) => {
          const pct = total > 0 ? Math.round((bar.count / total) * 100) : 0;

          return (
            <motion.div
              key={bar.label}
              initial={false}
              animate={{ opacity: 1 }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { delay: i * 0.1, duration: 0.3 }
              }
              className="space-y-1"
            >
              <div className="flex justify-between items-baseline gap-2">
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{pct}%</span>{" "}
                  {bar.label}
                </p>
                <span className="text-xs text-muted-foreground flex-none">
                  {bar.count}/{total}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  initial={{ width: "0%" }}
                  whileInView={{ width: `${pct}%` }}
                  viewport={{ once: true }}
                  transition={
                    prefersReducedMotion
                      ? { duration: 0 }
                      : { delay: i * 0.1, duration: 0.6, ease: "easeOut" }
                  }
                />
              </div>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
