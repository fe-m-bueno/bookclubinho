"use client";

import { useReducedMotion, motion } from "framer-motion";
import type { BadgeProgressResponse } from "@/lib/types/badge";

interface BadgeProgressBarProps {
  progress: BadgeProgressResponse;
}

export function BadgeProgressBar({ progress }: BadgeProgressBarProps) {
  const prefersReducedMotion = useReducedMotion();
  const { name, current, target, percentage, emoji } = progress;

  return (
    <div className="space-y-1.5">
      <div className="type-body flex items-center justify-between">
        <span>
          {name}
          {emoji != null ? ` ${emoji}` : ""}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {current}/{target}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: 0.6, ease: "easeOut" }
          }
        />
      </div>
      <p className="type-micro text-right">
        {percentage}% concluído
      </p>
    </div>
  );
}
