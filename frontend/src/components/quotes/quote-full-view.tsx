"use client";

import { useRef } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { QuoteResponse } from "@/lib/types/quote";

interface QuoteFullViewProps {
  quote: QuoteResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuoteFullView({ quote, open, onOpenChange }: QuoteFullViewProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
    if (!cardRef.current) return;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, { useCORS: true });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Erro ao gerar imagem.");
          return;
        }

        const file = new File([blob], "quote.png", { type: "image/png" });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: quote?.book_title ?? "Quote",
            });
          } catch (shareErr) {
            if (
              shareErr instanceof DOMException &&
              shareErr.name === "AbortError"
            ) {
              return;
            }
            downloadBlob(blob, "quote.png");
          }
        } else {
          downloadBlob(blob, "quote.png");
        }
      });
    } catch {
      toast.error("Erro ao gerar imagem para compartilhar.");
    }
  }

  if (!quote) return null;

  const authorName = quote.display_name ?? quote.username ?? "Membro";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Quote de {authorName}</DialogTitle>
        </DialogHeader>

        {/* Shareable card */}
        <div
          ref={cardRef}
          className="rounded-xl p-6 bg-gradient-to-br from-[oklch(0.90_0.06_68)] to-[oklch(0.84_0.08_55)] dark:from-[oklch(0.30_0.06_55)] dark:to-[oklch(0.24_0.08_50)]"
        >
          <p className="italic font-medium text-base leading-relaxed text-foreground mb-4">
            &ldquo;{quote.quote_text}&rdquo;
          </p>

          {quote.page_reference && (
            <p className="text-xs text-muted-foreground mb-3">
              {quote.page_reference}
            </p>
          )}

          <div className="border-t border-foreground/10 pt-3 mt-3">
            <p className="text-sm font-semibold text-foreground">
              {quote.book_title}
            </p>
            {quote.book_author && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {quote.book_author}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              &mdash; {authorName}
            </p>
          </div>
        </div>

        {/* Share button */}
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 gap-2"
          onClick={handleShare}
        >
          <Share2 className="h-4 w-4" />
          Compartilhar como imagem
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
