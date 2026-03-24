"use client";

import { useState, useCallback } from "react";
import { Plus, Quote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGroup } from "@/lib/contexts/group-context";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useQuotes, useQuoteMutations } from "@/hooks/use-quotes";
import { QuotesSkeleton } from "./quotes-skeleton";
import { QuoteMasonryGrid } from "./quote-masonry-grid";
import { QuoteFullView } from "./quote-full-view";
import { CreateQuoteDialog } from "./create-quote-dialog";
import type { QuoteResponse } from "@/lib/types/quote";

interface QuotesClientProps {
  groupId: string;
}

export function QuotesClient({ groupId }: QuotesClientProps) {
  const { group } = useGroup();
  const currentUserId = group.current_user_id;

  const [sort, setSort] = useState<"votes" | "recent">("votes");
  const [selectedQuote, setSelectedQuote] = useState<QuoteResponse | null>(
    null,
  );
  const [showCreate, setShowCreate] = useState(false);

  const { quotes, loading, loadingMore, hasMore, error, loadMore, refetch } =
    useQuotes({ groupId, sort });
  const { showSkeleton } = useSkeletonState(loading);

  const { toggleVote, deleteQuote } = useQuoteMutations(groupId);

  const handleVoteToggle = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await toggleVote(id);
      if (result === null) {
        toast.error("Erro ao votar. Tente novamente.");
        return false;
      }
      return true;
    },
    [toggleVote],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteQuote(id);
      if (success) {
        refetch();
        toast.success("Quote removida.");
      } else {
        toast.error("Erro ao remover quote. Tente novamente.");
      }
    },
    [deleteQuote, refetch],
  );

  const handleCreated = useCallback(
    (q: QuoteResponse) => {
      refetch();
      toast.success(`Quote de "${q.book_title}" adicionada!`);
    },
    [refetch],
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold text-lg text-foreground flex items-center gap-2 tracking-tight">
          <Quote className="h-5 w-5 text-muted-foreground" />
          Hall of Quotes
        </h2>

        <Button
          size="sm"
          onClick={() => setShowCreate(true)}
          className="shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nova quote
        </Button>
      </div>

      {/* Sort toggle */}
      <div className="flex gap-2">
        <Button
          variant={sort === "votes" ? "default" : "outline"}
          size="sm"
          onClick={() => setSort("votes")}
        >
          Mais votadas
        </Button>
        <Button
          variant={sort === "recent" ? "default" : "outline"}
          size="sm"
          onClick={() => setSort("recent")}
        >
          Recentes
        </Button>
      </div>

      {/* Content */}
      {showSkeleton ? (
        <QuotesSkeleton />
      ) : !loading && error ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={refetch}>
            Tentar novamente
          </Button>
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <Quote className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">
            Nenhuma quote ainda. Seja o primeiro!
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreate(true)}
          >
            Adicionar quote
          </Button>
        </div>
      ) : (
        <>
          <QuoteMasonryGrid
            quotes={quotes}
            currentUserId={currentUserId}
            onVoteToggle={handleVoteToggle}
            onDelete={handleDelete}
            onSelect={setSelectedQuote}
          />

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="min-w-[120px]"
              >
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Carregar mais"
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <QuoteFullView
        quote={selectedQuote}
        open={selectedQuote !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedQuote(null);
        }}
      />

      <CreateQuoteDialog
        groupId={groupId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={handleCreated}
      />
    </div>
  );
}
