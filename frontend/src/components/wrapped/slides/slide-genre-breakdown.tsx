"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideGenreBreakdownProps {
  data: WrappedData;
}

export function SlideGenreBreakdown({ data }: SlideGenreBreakdownProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  const topGenres = data.genre_breakdown.slice(0, 5);

  if (topGenres.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">📊</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Sem dados de gênero</h2>
      </div>
    );
  }

  const maxPct = Math.max(...topGenres.map((g) => g.percentage));

  return (
    <div className="flex flex-col gap-6 w-full max-w-sm mx-auto">
      <motion.div
        className="text-center"
        initial={shouldReduce ? {} : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        <p className="text-sm font-semibold text-foreground/60 uppercase tracking-widest">
          Gêneros do ano
        </p>
      </motion.div>

      <motion.div
        variants={variants.container}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {topGenres.map((genre, i) => {
          const barWidth = maxPct > 0 ? (genre.percentage / maxPct) * 100 : 0;
          return (
            <motion.div key={genre.genre} variants={variants.item} className="space-y-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-foreground">
                  {genre.genre}
                </span>
                <span className="text-sm font-bold text-foreground/70 tabular-nums">
                  {genre.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-foreground/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `oklch(${0.65 - i * 0.05} ${0.12 + i * 0.02} ${55 + i * 8})`,
                  }}
                  initial={{ width: "0%" }}
                  animate={{ width: `${barWidth}%` }}
                  transition={
                    shouldReduce
                      ? { duration: 0 }
                      : { duration: 0.7, delay: i * 0.1, ease: "easeOut" }
                  }
                />
              </div>
              <p className="text-xs text-foreground/50">
                {genre.count} {genre.count === 1 ? "livro" : "livros"}
              </p>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
