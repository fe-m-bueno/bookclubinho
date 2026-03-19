"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { toast } from "sonner";
import type { BookResult, BookDetail } from "@/lib/types/book";
import type { NominationCreatePayload } from "@/lib/types/round";

const MAX_PITCH = 280;

interface BookDetailDrawerProps {
  book: BookResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roundId: string;
  onNominated: () => void;
}

export function BookDetailDrawer({
  book,
  open,
  onOpenChange,
  roundId,
  onNominated,
}: BookDetailDrawerProps) {
  const [detail, setDetail] = useState<BookDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pitch, setPitch] = useState("");

  // Fetch book detail when drawer opens
  useEffect(() => {
    if (!open || !book) {
      setDetail(null);
      setPitch("");
      return;
    }

    setLoadingDetail(true);
    const controller = new AbortController();

    fetch(`/api/v1/books/${encodeURIComponent(book.slug)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<BookDetail>) : null))
      .then((data) => {
        if (!controller.signal.aborted) setDetail(data);
      })
      .catch(() => {
        // Graceful: show book without extra detail
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingDetail(false);
      });

    return () => controller.abort();
  }, [open, book?.slug]);

  const { submit, loading: nominating } = useAuthSubmit({
    url: `/api/v1/rounds/${roundId}/nominate`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Livro indicado!");
      onNominated();
    },
    statusHandlers: [
      {
        status: 409,
        handler: async (res) => {
          const data = await res.json().catch(() => ({}));
          const detail = (data as { detail?: string }).detail ?? "";
          if (detail.includes("já indicado")) {
            toast.error("Livro já indicado nesta rodada.");
          } else if (detail.includes("Máximo")) {
            toast.error("Limite de 3 indicações atingido.");
          } else if (detail.includes("indicações")) {
            toast.error("Fase de indicações encerrada.");
          } else {
            toast.error("Não foi possível indicar o livro.");
          }
        },
      },
    ],
  });

  const handleNominate = () => {
    if (!book) return;

    const trimmed = pitch.trim();
    if (trimmed.length > MAX_PITCH) return;

    const payload: NominationCreatePayload = {
      book_id: book.book_id,
      book_title: book.title,
      book_author: book.author,
      book_cover_url: book.cover_url,
      book_hardcover_slug: book.slug,
      book_page_count: book.page_count,
      ...(trimmed ? { pitch: trimmed } : {}),
    };

    submit(JSON.stringify(payload));
  };

  if (!book) return null;

  const overLimit = pitch.length > MAX_PITCH;
  const remainingChars = MAX_PITCH - pitch.length;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <div className="overflow-y-auto">
          <DrawerHeader>
            <DrawerTitle className="text-left">Indicar livro</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 space-y-4">
            {/* Book info */}
            <div className="flex gap-4">
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-muted shadow-md">
                {book.cover_url ? (
                  <Image
                    src={book.cover_url}
                    alt={`Capa de ${book.title}`}
                    fill
                    className="object-cover"
                    sizes="80px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-xs text-center px-1">
                    Sem capa
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold text-foreground line-clamp-2 leading-tight">
                  {book.title}
                </p>
                <p className="text-sm text-muted-foreground">{book.author}</p>
                {book.page_count && (
                  <p className="text-xs text-muted-foreground">
                    {book.page_count} páginas
                  </p>
                )}

                {/* Genres */}
                {loadingDetail && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Carregando detalhes...
                  </div>
                )}
                {detail?.genres && detail.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {detail.genres.slice(0, 3).map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Description */}
            {detail?.description && (
              <p className="text-sm text-muted-foreground line-clamp-3">
                {detail.description}
              </p>
            )}

            {/* Pitch */}
            <div className="space-y-1.5">
              <label
                htmlFor="pitch"
                className="text-sm font-medium text-foreground"
              >
                Por que você indica este livro?{" "}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Textarea
                id="pitch"
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                placeholder="Convença o grupo a ler este livro..."
                rows={3}
                className={`resize-none ${overLimit ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
                aria-describedby="pitch-count"
              />
              <p
                id="pitch-count"
                className={`text-xs text-right ${
                  overLimit ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {remainingChars} caracteres restantes
              </p>
            </div>
          </div>

          <DrawerFooter>
            <Button
              onClick={handleNominate}
              disabled={nominating || overLimit}
              className="w-full min-h-[44px]"
            >
              {nominating && <Loader2 className="h-4 w-4 animate-spin" />}
              Nominar
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full min-h-[44px]"
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
