"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useGroup } from "@/lib/contexts/group-context";
import { useCurrentRound } from "@/hooks/use-current-round";
import { useBookSearch } from "@/hooks/use-book-search";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { Button } from "@/components/ui/button";
import { RoundSkeleton } from "./round-skeleton";
import { RoundStatusBadge } from "./round-status-badge";
import { BookSearchBar } from "./book-search-bar";
import { BookSearchResults } from "./book-search-results";
import { BookDetailDrawer } from "./book-detail-drawer";
import { NominationList } from "./nomination-list";
import { StartVotingButton } from "./start-voting-button";
import type { BookResult } from "@/lib/types/book";

export function RoundNominatingClient() {
  const { group } = useGroup();
  const isAdmin = group.invite_code !== null;
  const { round, loading, error, refetch } = useCurrentRound(group.id);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<BookResult | null>(null);

  const { results: searchResults, loading: searchLoading } =
    useBookSearch(searchQuery);

  const { submit: createRound, loading: creatingRound } = useAuthSubmit({
    url: `/api/v1/groups/${group.id}/rounds`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Rodada criada!");
      refetch();
    },
  });

  if (loading) return <RoundSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button type="button" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!round) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <BookOpen className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Nenhuma rodada ativa</p>
          {isAdmin ? (
            <p className="text-sm text-muted-foreground">
              Crie uma rodada para começar as indicações.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aguarde o admin criar uma nova rodada.
            </p>
          )}
        </div>
        {isAdmin && (
          <Button
            type="button"
            onClick={() => createRound(JSON.stringify({}))}
            disabled={creatingRound}
            className="min-h-[44px] px-6"
          >
            Criar Rodada
          </Button>
        )}
      </div>
    );
  }

  if (round.status !== "nominating") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <RoundStatusBadge round={round} />
        <p className="text-sm text-muted-foreground">
          As indicações estão encerradas para esta rodada.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RoundStatusBadge round={round} />

      <BookSearchBar
        value={searchQuery}
        onChange={setSearchQuery}
        loading={searchLoading}
      />

      {searchQuery.length >= 2 && (
        <BookSearchResults
          results={searchResults}
          loading={searchLoading}
          onSelect={setSelectedBook}
        />
      )}

      <NominationList
        nominations={round.nominations}
        members={group.members}
        currentUserId={group.current_user_id}
        roundId={round.id}
        onRemoved={refetch}
      />

      {isAdmin && (
        <StartVotingButton
          roundId={round.id}
          nominations={round.nominations}
          onSuccess={refetch}
        />
      )}

      <BookDetailDrawer
        book={selectedBook}
        open={selectedBook !== null}
        onOpenChange={(open) => { if (!open) setSelectedBook(null); }}
        roundId={round.id}
        onNominated={() => {
          setSelectedBook(null);
          setSearchQuery("");
          refetch();
        }}
      />
    </div>
  );
}
