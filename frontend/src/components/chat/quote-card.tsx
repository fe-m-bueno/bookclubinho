"use client";

import { BookOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type ChatMessage } from "@/lib/types/chat";
import { getAuthorName, getAuthorInitials } from "@/lib/chat-utils";

interface QuoteCardProps {
  message: ChatMessage;
}

export function QuoteCard({ message }: QuoteCardProps) {
  const quoteText = message.content_text;
  const page = message.reference_value;
  const bookTitle = message.content_rich_json?.book_title as string | undefined;
  const bookAuthor = message.content_rich_json?.book_author as string | undefined;

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4">
      {/* Opening quotation mark */}
      <p
        className="mb-1 font-serif text-4xl leading-none text-brand-300 select-none"
        aria-hidden="true"
      >
        &ldquo;
      </p>

      {/* Quote body */}
      {quoteText && (
        <blockquote className="font-serif text-base italic leading-relaxed">
          {quoteText}
        </blockquote>
      )}

      {/* Page reference */}
      {page && (
        <p className="mt-2 text-xs text-muted-foreground">Página {page}</p>
      )}

      {/* Book attribution */}
      {bookTitle && (
        <div className="mt-2 flex items-start gap-1.5">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate text-foreground">{bookTitle}</p>
            {bookAuthor && (
              <p className="text-xs text-muted-foreground truncate">{bookAuthor}</p>
            )}
          </div>
        </div>
      )}

      {/* Author attribution */}
      <footer className="mt-3 flex items-center gap-2">
        <Avatar className="size-5 shrink-0">
          <AvatarImage
            src={message.author.avatar_url ?? undefined}
            alt={getAuthorName(message.author)}
          />
          <AvatarFallback className="text-[10px]">
            {getAuthorInitials(message.author)}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs font-medium text-muted-foreground">
          {getAuthorName(message.author)}
        </span>
      </footer>
    </div>
  );
}
