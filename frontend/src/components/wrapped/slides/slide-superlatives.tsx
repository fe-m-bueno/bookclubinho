"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideSuperlativesProps {
  data: WrappedData;
}

export function SlideSuperlatives({ data }: SlideSuperlativesProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  if (data.member_superlatives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">🏅</p>
        <h2 className="text-2xl font-bold text-foreground">Superlativo não disponível</h2>
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
          Superlativo do ano
        </p>
      </motion.div>

      <motion.div
        variants={variants.container}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        {data.member_superlatives.map((s) => {
          const displayName = s.display_name ?? s.username;
          return (
            <motion.div
              key={s.user_id}
              variants={variants.item}
              className="flex items-center gap-3 bg-foreground/10 rounded-2xl p-4"
            >
              <span className="text-2xl flex-shrink-0">{s.emoji}</span>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                {s.avatar_url ? (
                  <Image
                    src={s.avatar_url}
                    alt={displayName}
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">
                  {displayName}
                </p>
                <p className="text-xs text-foreground/60 truncate">{s.title}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-bold text-foreground/80 tabular-nums">
                  {s.stat_value}
                </p>
                <p className="text-xs text-foreground/50">{s.stat_label}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
