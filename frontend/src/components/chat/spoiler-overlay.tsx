"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EyeOff } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { type ChatMessage } from "@/lib/types/chat";
import { SpoilerConfirmDialog } from "./spoiler-confirm-dialog";

interface SpoilerOverlayProps {
  message: ChatMessage;
  currentUserId: string;
  viewerChapter?: number | null;
  children: ReactNode;
}

export function SpoilerOverlay({
  message,
  currentUserId,
  viewerChapter,
  children,
}: SpoilerOverlayProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isRevealed = useChatStore((s) => s.isSpoilerRevealed(message.id));

  // If not a spoiler message, or author is the current user: render directly
  if (!message.is_spoiler || message.author.user_id === currentUserId) {
    return <>{children}</>;
  }

  // Already manually revealed
  if (isRevealed) {
    return <>{children}</>;
  }

  // Auto-reveal if viewer has passed the spoiler chapter
  const shouldAutoReveal =
    viewerChapter != null &&
    message.spoiler_chapter != null &&
    viewerChapter >= message.spoiler_chapter;

  if (shouldAutoReveal) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="relative">
        {/* Blurred children beneath the overlay */}
        <div className="select-none" aria-hidden="true">
          {children}
        </div>

        <AnimatePresence>
          <motion.button
            type="button"
            key="spoiler-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            onClick={() => setConfirmOpen(true)}
            aria-label={`Revelar spoiler do capítulo ${message.spoiler_chapter ?? "?"}`}
            className="absolute inset-0 flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-xl backdrop-blur-[8px] bg-brand-200/60 dark:bg-brand-800/60 transition-colors hover:bg-brand-200/70 dark:hover:bg-brand-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <EyeOff className="size-5 text-brand-800 dark:text-brand-200" aria-hidden="true" />
            <span className="text-xs font-medium text-brand-900 dark:text-brand-100">
              Spoiler{message.spoiler_chapter != null ? ` — Capítulo ${message.spoiler_chapter}+` : ""}
            </span>
          </motion.button>
        </AnimatePresence>
      </div>

      <SpoilerConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        spoilerChapter={message.spoiler_chapter}
        viewerChapter={viewerChapter ?? null}
        messageId={message.id}
      />
    </>
  );
}
