"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQuoteMutations } from "@/hooks/use-quotes";
import type { QuoteResponse } from "@/lib/types/quote";

interface CreateQuoteDialogProps {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (q: QuoteResponse) => void;
}

const MAX_QUOTE_LENGTH = 2000;

export function CreateQuoteDialog({
  groupId,
  open,
  onOpenChange,
  onCreated,
}: CreateQuoteDialogProps) {
  const [quoteText, setQuoteText] = useState("");
  const [pageReference, setPageReference] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { createQuote } = useQuoteMutations(groupId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = quoteText.trim();
    if (!trimmed) return;

    setSubmitting(true);

    try {
      const result = await createQuote({
        quote_text: trimmed,
        page_reference: pageReference.trim() || null,
      });

      if (result) {
        onCreated(result);
        onOpenChange(false);
        setQuoteText("");
        setPageReference("");
      } else {
        toast.error("Erro ao criar quote. Tente novamente.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!submitting) {
      onOpenChange(nextOpen);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Quote</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label
              htmlFor="quote-text"
              className="text-sm font-medium text-foreground"
            >
              Trecho do livro
            </label>
            <div className="relative">
              <Textarea
                id="quote-text"
                placeholder="Digite o trecho que mais te marcou..."
                className="resize-none pr-3 pb-6"
                maxLength={MAX_QUOTE_LENGTH}
                rows={5}
                value={quoteText}
                onChange={(e) => setQuoteText(e.target.value)}
                autoFocus
                required
              />
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground tabular-nums">
                {quoteText.length}/{MAX_QUOTE_LENGTH}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="quote-page"
              className="text-sm font-medium text-foreground"
            >
              Referência{" "}
              <span className="text-muted-foreground font-normal">
                (opcional)
              </span>
            </label>
            <Input
              id="quote-page"
              placeholder="Página ou capítulo"
              value={pageReference}
              onChange={(e) => setPageReference(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11"
            disabled={!quoteText.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Adicionar quote"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
