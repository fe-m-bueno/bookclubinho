"use client";

import { motion, AnimatePresence } from "framer-motion";
import { type ReactionSummary } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

interface MessageReactionsProps {
  reactions: ReactionSummary[];
  messageId: string;
  isOwn: boolean;
  onToggle: (emoji: string) => void;
}

export function MessageReactions({
  reactions,
  isOwn,
  onToggle,
}: MessageReactionsProps) {
  const visible = reactions.filter((r) => r.count > 0);

  if (visible.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap gap-1",
        isOwn ? "justify-end" : "justify-start",
      )}
    >
      <AnimatePresence initial={false}>
        {visible.map((reaction) => (
          <motion.button
            key={reaction.emoji}
            layoutId={`reaction-${reaction.emoji}`}
            type="button"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            whileTap={{ scale: 0.88 }}
            onClick={() => onToggle(reaction.emoji)}
            aria-label={`${reaction.emoji} ${reaction.count} ${reaction.did_i_react ? "— remover reação" : "— reagir"}`}
            aria-pressed={reaction.did_i_react}
            className={cn(
              "flex min-h-[28px] items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              reaction.did_i_react
                ? "border-sage-400 bg-sage-100 ring-1 ring-sage-400 dark:border-sage-600 dark:bg-sage-800"
                : "border-border bg-muted hover:bg-accent",
            )}
          >
            <span aria-hidden="true">{reaction.emoji}</span>
            <span className="tabular-nums text-muted-foreground">
              {reaction.count}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
