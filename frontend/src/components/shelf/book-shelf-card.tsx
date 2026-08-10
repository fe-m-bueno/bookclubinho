"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StarsDisplay } from "@/components/ui/stars-display";
import { useTick } from "@/hooks/use-tick";
import { getTickSnapshot } from "@/stores/tick-store";
import type { ShelfBook } from "@/lib/types/shelf";

/** Segundos que cada one-liner fica na tela antes do próximo. */
const ONELINER_SECONDS = 5;

interface BookShelfCardProps {
  book: ShelfBook;
  groupId?: string;
}

const readDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
});

function formatReadDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  return readDateFormatter
    .format(new Date(dateStr))
    .replace(/\./g, "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function OnelinerCarousel({ oneliners }: { oneliners: string[] }) {
  // A âncora diz de qual índice contar e a partir de qual tick — clicar num
  // ponto reancora, então a rotação recomeça do zero a partir da escolha.
  const [anchor, setAnchor] = useState(() => ({
    tick: getTickSnapshot(),
    index: 0,
  }));

  const rotating = oneliners.length > 1;
  const tick = useTick(rotating);

  if (!oneliners.length) return null;

  const current = rotating
    ? (anchor.index +
        Math.floor((tick - anchor.tick) / ONELINER_SECONDS)) %
      oneliners.length
    : 0;

  return (
    <div className="space-y-2">
      <div className="relative min-h-[3.5rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={current}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="type-meta italic text-center"
          >
            &ldquo;{oneliners[current]}&rdquo;
          </motion.p>
        </AnimatePresence>
      </div>
      {oneliners.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {oneliners.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setAnchor({ tick: getTickSnapshot(), index: i })}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${
                i === current
                  ? "bg-foreground"
                  : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
              }`}
              aria-label={`One-liner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BookShelfCard({ book, groupId }: BookShelfCardProps) {
  const [open, setOpen] = useState(false);
  const readDate = formatReadDate(book.finished_at);

  return (
    <>
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        className="group w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
        aria-label={`Ver detalhes de ${book.book_title}`}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {/* Book cover with 3D spine effect */}
        <div
          className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-sage-200 dark:border-sage-700"
          style={{
            transform: "perspective(600px) rotateY(-8deg)",
            boxShadow:
              "-6px 4px 14px rgba(0,0,0,0.28), 2px 3px 10px rgba(0,0,0,0.12)",
          }}
        >
          {book.book_cover_url ? (
            <Image
              src={book.book_cover_url}
              alt={`Capa de ${book.book_title}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted p-3">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
              <p className="type-micro text-center line-clamp-3">
                {book.book_title}
              </p>
            </div>
          )}
          {/* Spine shadow overlay */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-5"
            style={{
              background:
                "linear-gradient(to right, rgba(0,0,0,0.32), transparent)",
            }}
          />
        </div>

        {/* Title + stars below cover */}
        <div className="mt-2 px-1 space-y-1">
          <p className="type-micro line-clamp-2 text-center">
            {book.book_title}
          </p>
          {book.average_rating != null && (
            <div className="flex justify-center">
              <StarsDisplay rating={Math.round(book.average_rating)} />
            </div>
          )}
        </div>
      </motion.button>

      {/* Detail Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle className="pr-6">
              {book.book_title}
            </DialogTitle>
            {book.book_author && (
              <DialogDescription>{book.book_author}</DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Cover + meta row */}
            <div className="flex gap-4">
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-muted shadow-md">
                {book.book_cover_url ? (
                  <Image
                    src={book.book_cover_url}
                    alt={`Capa de ${book.book_title}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5 min-w-0">
                {book.average_rating != null && (
                  <div className="flex items-center gap-1.5">
                    <StarsDisplay
                      rating={Math.round(book.average_rating)}
                      size="md"
                    />
                    <span className="type-micro">
                      {book.average_rating.toFixed(1)}
                    </span>
                  </div>
                )}
                {book.page_count != null && (
                  <p className="type-micro">
                    {book.page_count.toLocaleString("pt-BR")} páginas
                  </p>
                )}
                {readDate && (
                  <p className="type-micro">
                    Lido em {readDate}
                  </p>
                )}
                {book.review_count > 0 && (
                  <p className="type-micro">
                    {book.review_count} review
                    {book.review_count !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Genres */}
            {book.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {book.genres.map((g) => (
                  <Badge key={g} variant="secondary">
                    {g}
                  </Badge>
                ))}
              </div>
            )}

            {/* One-liner carousel */}
            {book.top_oneliners.length > 0 && (
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="type-micro mb-2.5">
                  O que o grupo disse:
                </p>
                <OnelinerCarousel oneliners={book.top_oneliners} />
              </div>
            )}

            {/* Ver quotes link */}
            {groupId && (
              <Link
                href={`/groups/${groupId}/quotes`}
                className="type-micro block text-center text-sage-600 dark:text-sage-400 hover:underline"
                onClick={() => setOpen(false)}
              >
                Ver todas as quotes →
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
