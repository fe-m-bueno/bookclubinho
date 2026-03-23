"use client";

import Image from "next/image";
import { Check, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NominationSummary } from "@/lib/types/round";

interface VotingCardProps {
  nomination: NominationSummary;
  nominatorName: string;
  nominatorAvatarUrl: string | null;
  isSelected: boolean;
  isRevealed: boolean;
  isWinner: boolean;
  disabled: boolean;
  onVote: (nominationId: string) => void;
}

export function VotingCard({
  nomination,
  nominatorName,
  nominatorAvatarUrl,
  isSelected,
  isRevealed,
  isWinner,
  disabled,
  onVote,
}: VotingCardProps) {
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      onClick={() => !disabled && onVote(nomination.id)}
      className={cn(
        "relative w-full rounded-xl border bg-card p-4 text-left transition-all shadow-warm-sm",
        isSelected && !isRevealed
          ? "border-sage-400 dark:border-sage-300 ring-2 ring-sage-400/40"
          : "border-border",
        isWinner && isRevealed && "ring-4 ring-sage-500",
        disabled
          ? "pointer-events-none"
          : "cursor-pointer hover:border-muted-foreground/40",
      )}
      aria-pressed={isSelected}
      aria-label={`Votar em ${nomination.book_title}`}
      type="button"
    >
      <div className="flex gap-3">
        {/* Cover */}
        <div className="relative h-[120px] w-20 shrink-0 overflow-hidden rounded-md bg-muted">
          {nomination.book_cover_url ? (
            <Image
              src={nomination.book_cover_url}
              alt={`Capa de ${nomination.book_title}`}
              fill
              className="object-cover"
              sizes="80px"
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-xs">
              —
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-semibold text-sm leading-tight line-clamp-2">
            {nomination.book_title}
          </p>
          {nomination.book_author && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {nomination.book_author}
            </p>
          )}

          <div className="flex items-center gap-1.5 mt-1">
            <Avatar size="sm">
              <AvatarImage src={nominatorAvatarUrl ?? undefined} />
              <AvatarFallback>
                {(nominatorName[0] ?? "?").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate">
              {nominatorName}
            </span>
          </div>

          {nomination.pitch && (
            <p className="mt-1 text-xs text-foreground/70 line-clamp-3 italic">
              &ldquo;{nomination.pitch}&rdquo;
            </p>
          )}

          {isRevealed && (
            <p className="mt-1 text-xs font-medium text-foreground">
              {nomination.vote_count}{" "}
              {nomination.vote_count === 1 ? "voto" : "votos"}
            </p>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="mt-3 flex flex-wrap gap-2">
        {isSelected && !isRevealed && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Check className="h-3 w-3" />
            Seu voto
          </Badge>
        )}
        {isWinner && isRevealed && (
          <Badge className="gap-1 text-xs bg-sage-600 hover:bg-sage-600 text-white">
            <Trophy className="h-3 w-3" />
            Vencedor
          </Badge>
        )}
      </div>

      {/* Pulse ring for selected card */}
      {isSelected && !isRevealed && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-sage-400/30"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.button>
  );
}
