"use client";

import { BookOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useChatStore } from "@/stores/chat-store";
import { type ChatMessage } from "@/lib/types/chat";
import { getAuthorName, getAuthorInitials } from "@/lib/chat-utils";

interface ChapterMarkerCardProps {
  message: ChatMessage;
}

export function ChapterMarkerCard({ message }: ChapterMarkerCardProps) {
  const setChapterFilter = useChatStore((s) => s.setChapterFilter);
  const chapter = message.reference_value;

  function handleClick() {
    if (chapter != null) {
      const num = Number(chapter);
      if (!Number.isNaN(num)) {
        setChapterFilter(num);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full cursor-pointer rounded-r-lg border-l-4 border-brand-400 bg-muted/50 p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`Filtrar mensagens do capítulo ${chapter ?? "?"}`}
    >
      <div className="flex items-center gap-2">
        <BookOpen
          className="size-4 shrink-0 text-brand-600 dark:text-brand-300"
          aria-hidden="true"
        />

        <Avatar className="size-5 shrink-0">
          <AvatarImage
            src={message.author.avatar_url ?? undefined}
            alt={getAuthorName(message.author)}
          />
          <AvatarFallback className="text-[10px]">
            {getAuthorInitials(message.author)}
          </AvatarFallback>
        </Avatar>

        <span className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {getAuthorName(message.author)}
          </span>{" "}
          chegou no capítulo{" "}
          <span className="font-semibold text-brand-700 dark:text-brand-300">
            {chapter ?? "—"}
          </span>
        </span>
      </div>
    </button>
  );
}
