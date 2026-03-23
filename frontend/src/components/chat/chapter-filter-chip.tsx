"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";

interface ChapterFilterChipProps {
  chapter: number;
  onClear: () => void;
}

export function ChapterFilterChip({ chapter, onClear }: ChapterFilterChipProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-sage-900 dark:bg-sage-800 dark:text-sage-100"
    >
      <span>Capítulo {chapter}</span>

      <button
        type="button"
        onClick={onClear}
        aria-label="Remover filtro de capítulo"
        className="ml-0.5 flex size-4 items-center justify-center rounded-full transition-colors hover:bg-sage-200 dark:hover:bg-sage-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-2.5" aria-hidden="true" />
      </button>
    </motion.div>
  );
}
