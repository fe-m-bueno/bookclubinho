"use client";

import { useState } from "react";
import { useBookSearch } from "@/hooks/use-book-search";
import { RoundStatusBadge } from "./round-status-badge";
import { BookSearchBar } from "./book-search-bar";
import { BookSearchResults } from "./book-search-results";
import { BookDetailDrawer } from "./book-detail-drawer";
import { NominationList } from "./nomination-list";
import { StartVotingButton } from "./start-voting-button";
import type { BookResult } from "@/lib/types/book";
import type { RoundDetailResponse } from "@/lib/types/round";
import type { GroupDetailResponse } from "@/lib/types/group";

interface RoundNominatingPhaseProps {
  round: RoundDetailResponse;
  isAdmin: boolean;
  refetch: () => void;
  group: GroupDetailResponse;
}

export function RoundNominatingPhase({
  round,
  isAdmin,
  refetch,
  group,
}: RoundNominatingPhaseProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBook, setSelectedBook] = useState<BookResult | null>(null);

  const { results: searchResults, loading: searchLoading } =
    useBookSearch(searchQuery);

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
        onOpenChange={(open) => {
          if (!open) setSelectedBook(null);
        }}
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
