"use client";

import { useMemo } from "react";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ShelfBook } from "@/lib/types/shelf";

interface ReadingTimelineProps {
  books: ShelfBook[];
}

function formatMonthYear(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function ReadingTimeline({ books }: ReadingTimelineProps) {
  const finished = useMemo(() => {
    return books
      .filter((b) => b.finished_at !== null)
      .sort((a, b) => {
        const aDate = a.finished_at ? new Date(a.finished_at).getTime() : 0;
        const bDate = b.finished_at ? new Date(b.finished_at).getTime() : 0;
        return aDate - bDate;
      });
  }, [books]);

  if (finished.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linha do tempo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum livro finalizado ainda.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linha do tempo</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className="overflow-x-auto flex gap-4 pb-4 snap-x snap-mandatory"
          style={{ scrollbarWidth: "thin" }}
        >
          {finished.map((book, i) => (
            <div
              key={`${book.book_title}-${book.finished_at}-${i}`}
              className="snap-center flex-none w-20"
            >
              <div className="relative w-20 rounded-lg overflow-hidden bg-muted"
                style={{ aspectRatio: "2/3" }}
              >
                {book.book_cover_url ? (
                  <Image
                    src={book.book_cover_url}
                    alt={book.book_title}
                    fill
                    className="object-cover"
                    sizes="80px"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                    <BookOpen className="h-8 w-8" />
                  </div>
                )}
              </div>
              <p className="text-xs mt-1 leading-tight text-foreground line-clamp-2">
                {book.book_title}
              </p>
              {book.finished_at && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatMonthYear(book.finished_at)}
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
