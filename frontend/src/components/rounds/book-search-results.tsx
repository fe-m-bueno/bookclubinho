"use client";

import Image from "next/image";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { BookResult } from "@/lib/types/book";

interface BookSearchResultsProps {
  results: BookResult[];
  onSelect: (book: BookResult) => void;
  loading: boolean;
}

function BookCard({ book, onSelect }: { book: BookResult; onSelect: (b: BookResult) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(book)}
      className="shrink-0 w-28 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      aria-label={`Selecionar ${book.title}`}
    >
      <div className="relative h-40 w-28 overflow-hidden rounded-lg bg-muted shadow-sm transition-transform group-hover:scale-[1.03] group-active:scale-95">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={`Capa de ${book.title}`}
            fill
            className="object-cover"
            sizes="112px"
            unoptimized
          />
        ) : (
          <div className="type-micro flex h-full items-center justify-center text-center px-2">
            Sem capa
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        {/* Meta, e não corpo: a coluna tem 112px, e o título aqui é rótulo de
            uma miniatura para escolher, não o texto que se lê. */}
        <p className="type-meta line-clamp-2 text-foreground">{book.title}</p>
        <p className="type-micro truncate">{book.author}</p>
        {book.page_count && (
          <p className="type-micro">{book.page_count} pág.</p>
        )}
      </div>
    </button>
  );
}

function BookCardSkeleton() {
  return (
    <div className="shrink-0 w-28 space-y-2">
      <Skeleton className="h-40 w-28 rounded-lg" />
      {/* Título em `type-meta` mede 18px de linha; autor em `type-micro`, 14. */}
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3.5 w-16" />
    </div>
  );
}

export function BookSearchResults({
  results,
  onSelect,
  loading,
}: BookSearchResultsProps) {
  const { showSkeleton } = useSkeletonState(loading);

  if (showSkeleton) {
    return (
      <div
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        aria-label="Carregando resultados"
        aria-busy="true"
      >
        {[1, 2, 3].map((i) => (
          <BookCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <p className="type-meta text-center py-4">
        Nenhum livro encontrado. Tente outro termo.
      </p>
    );
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
      role="list"
      aria-label="Resultados da busca"
    >
      {results.map((book) => (
        <div key={book.book_id} role="listitem">
          <BookCard book={book} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
