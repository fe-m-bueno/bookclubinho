"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type React from "react";

// Lazy-load the heavy emoji-mart picker only when the user opens the full picker
const EmojiPicker = dynamic(
  () => import("@emoji-mart/react").then((m) => m.default),
  { ssr: false, loading: () => null },
);

const QUICK_EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🔥"] as const;

interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  /** Absolute positioning style relative to the chat area container */
  style: React.CSSProperties;
}

export function ReactionPicker({ onSelect, onClose, style }: ReactionPickerProps) {
  const [showFullPicker, setShowFullPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dismiss on click outside or scroll
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("scroll", handleScroll, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [onClose]);

  function handleQuickSelect(emoji: string) {
    onSelect(emoji);
    onClose();
  }

  function handleFullPickerSelect(emojiData: { native: string }) {
    onSelect(emojiData.native);
    onClose();
  }

  return (
    <motion.div
      ref={containerRef}
      role="dialog"
      aria-label="Escolher reação"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      style={{ position: "absolute", zIndex: 200, ...style }}
      className="rounded-xl border bg-popover p-2 shadow-lg"
    >
      <AnimatePresence mode="wait">
        {showFullPicker ? (
          <motion.div
            key="full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <EmojiPicker
              onEmojiSelect={handleFullPickerSelect}
              locale="pt"
              previewPosition="none"
              skinTonePosition="none"
              theme="auto"
              perLine={7}
            />
          </motion.div>
        ) : (
          <motion.div
            key="quick"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-1"
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickSelect(emoji)}
                aria-label={`Reagir com ${emoji}`}
                className="flex size-9 items-center justify-center rounded-lg text-lg transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {emoji}
              </button>
            ))}

            <div className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

            <button
              type="button"
              onClick={() => setShowFullPicker(true)}
              aria-label="Abrir todos os emojis"
              className={cn(
                "flex size-9 items-center justify-center rounded-lg text-muted-foreground",
                "transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
