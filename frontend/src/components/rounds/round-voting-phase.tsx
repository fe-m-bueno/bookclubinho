"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { RoundStatusBadge } from "./round-status-badge";
import { VotingCard } from "./voting-card";
import { FinalizeVotingButton } from "./finalize-voting-button";
import type { RoundDetailResponse, FinalizeResponse } from "@/lib/types/round";
import type { GroupDetailResponse } from "@/lib/types/group";

interface RoundVotingPhaseProps {
  round: RoundDetailResponse;
  isAdmin: boolean;
  refetch: () => void;
  group: GroupDetailResponse;
  onFinalized: (result: FinalizeResponse) => void;
}

export function RoundVotingPhase({
  round,
  isAdmin,
  refetch,
  group,
  onFinalized,
}: RoundVotingPhaseProps) {
  const [votedNominationId, setVotedNominationId] = useState<string | null>(
    () => sessionStorage.getItem(`vote:${round.id}`),
  );

  const { submit: castVote, loading: voting } = useAuthSubmit({
    url: `/api/v1/rounds/${round.id}/vote`,
    headers: JSON_HEADERS,
    onSuccess: async () => {
      toast.success("Voto registrado!");
      refetch();
    },
    statusHandlers: [
      {
        status: 409,
        handler: async () => {
          toast.error("Não foi possível registrar o voto.");
        },
      },
    ],
  });

  const memberMap = new Map(group.members.map((m) => [m.user_id, m]));

  function handleVote(nominationId: string) {
    setVotedNominationId(nominationId);
    sessionStorage.setItem(`vote:${round.id}`, nominationId);
    castVote(JSON.stringify({ nomination_id: nominationId }));
  }

  return (
    <div className="space-y-6">
      <RoundStatusBadge round={round} />

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Escolha seu livro</h2>
        <p className="text-sm text-muted-foreground">
          Toque em um livro para votar. Você pode mudar seu voto.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {round.nominations.map((nomination) => {
          const member = memberMap.get(nomination.user_id);
          const nominatorName =
            member?.display_name ?? member?.username ?? "Membro";
          const nominatorAvatarUrl = member?.avatar_url ?? null;

          return (
            <VotingCard
              key={nomination.id}
              nomination={nomination}
              nominatorName={nominatorName}
              nominatorAvatarUrl={nominatorAvatarUrl}
              isSelected={votedNominationId === nomination.id}
              isRevealed={false}
              isWinner={false}
              disabled={voting}
              onVote={handleVote}
            />
          );
        })}
      </div>

      {isAdmin && (
        <FinalizeVotingButton
          roundId={round.id}
          onFinalized={onFinalized}
        />
      )}
    </div>
  );
}
