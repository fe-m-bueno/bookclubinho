"use client";

import { motion } from "framer-motion";

interface UploadProgressBarProps {
  progress: number;
}

export function UploadProgressBar({ progress }: UploadProgressBarProps) {
  if (progress <= 0) return null;

  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div className="flex flex-col gap-0.5 px-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do upload">
      <p className="self-end text-xs text-muted-foreground tabular-nums">{pct}%</p>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full rounded-full bg-brand-500"
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
