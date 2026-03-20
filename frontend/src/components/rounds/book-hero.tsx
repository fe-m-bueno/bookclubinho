"use client";

import Image from "next/image";
import { BookOpen } from "lucide-react";
import type { RoundDetailResponse } from "@/lib/types/round";

interface BookHeroProps {
  round: RoundDetailResponse;
  showPageCount?: boolean;
}

export function BookHero({ round, showPageCount = false }: BookHeroProps) {
  return (
    <div className="flex flex-col items-center gap-4 pt-2">
      <div className="relative h-[240px] w-[160px] shrink-0 overflow-hidden rounded-xl bg-muted shadow-xl">
        {round.book_cover_url ? (
          <Image
            src={round.book_cover_url}
            alt={round.book_title ?? "Capa do livro"}
            fill
            className="object-cover"
            unoptimized
            priority
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <BookOpen className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold leading-tight">
          {round.book_title}
        </h1>
        {round.book_author && (
          <p className="text-muted-foreground">{round.book_author}</p>
        )}
        {showPageCount && round.book_page_count && (
          <p className="text-sm text-muted-foreground">
            {round.book_page_count} páginas
          </p>
        )}
      </div>
    </div>
  );
}
