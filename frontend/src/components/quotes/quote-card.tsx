"use client";

import { Heart, Trash2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { QuoteResponse } from "@/lib/types/quote";

interface QuoteCardProps {
  quote: QuoteResponse;
  currentUserId: string;
  onVoteToggle: (id: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onSelect: (quote: QuoteResponse) => void;
}

export function QuoteCard({
  quote,
  currentUserId,
  onVoteToggle,
  onDelete,
  onSelect,
}: QuoteCardProps) {
  const [optimisticVoted, setOptimisticVoted] = useState(quote.did_i_vote);
  const [optimisticCount, setOptimisticCount] = useState(quote.vote_count);

  const authorName = quote.display_name ?? quote.username ?? "Membro";
  const isOwner = quote.user_id === currentUserId;

  async function handleVoteClick(e: React.MouseEvent) {
    e.stopPropagation();
    const wasVoted = optimisticVoted;
    setOptimisticVoted(!wasVoted);
    setOptimisticCount((c) => (wasVoted ? c - 1 : c + 1));
    const ok = await onVoteToggle(quote.id);
    if (!ok) {
      // rollback on server failure
      setOptimisticVoted(wasVoted);
      setOptimisticCount((c) => (wasVoted ? c + 1 : c - 1));
    }
  }

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(quote.id);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ver quote de ${authorName}`}
      onClick={() => onSelect(quote)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(quote);
        }
      }}
      className="break-inside-avoid mb-4 cursor-pointer rounded-xl border bg-card p-4 shadow-sm hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Quote text */}
      <p className="italic font-medium text-sm leading-relaxed text-foreground mb-3 line-clamp-6">
        &ldquo;{quote.quote_text}&rdquo;
      </p>

      {/* Page reference */}
      {quote.page_reference && (
        <p className="text-xs text-muted-foreground mb-2">
          {quote.page_reference}
        </p>
      )}

      {/* Book info */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate text-foreground">
            {quote.book_title}
          </p>
          {quote.book_author && (
            <p className="text-xs text-muted-foreground truncate">
              {quote.book_author}
            </p>
          )}
        </div>
      </div>

      {/* Footer: author + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {quote.avatar_url ? (
            <Image
              src={quote.avatar_url}
              alt={authorName}
              width={20}
              height={20}
              className="rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-5 h-5 rounded-full bg-muted shrink-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground"
            >
              {authorName[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <span className="text-xs text-muted-foreground truncate">
            {authorName}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {isOwner && (
            <button
              type="button"
              aria-label="Excluir quote"
              onClick={handleDeleteClick}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            aria-label={optimisticVoted ? "Remover voto" : "Votar nesta quote"}
            aria-pressed={optimisticVoted}
            onClick={handleVoteClick}
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center gap-1 rounded-md transition-colors hover:bg-muted"
          >
            <Heart
              className={`h-3.5 w-3.5 transition-colors ${
                optimisticVoted
                  ? "fill-rose-500 text-rose-500"
                  : "text-muted-foreground"
              }`}
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {optimisticCount}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
