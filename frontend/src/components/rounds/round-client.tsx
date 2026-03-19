"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useGroup } from "@/lib/contexts/group-context";
import { useCurrentRound } from "@/hooks/use-current-round";
import { useAuthSubmit, JSON_HEADERS } from "@/hooks/use-auth-submit";
import { Button } from "@/components/ui/button";
import { RoundSkeleton } from "./round-skeleton";
import { RoundStatusBadge } from "./round-status-badge";
import { RoundNominatingPhase } from "./round-nominating-phase";
import { RoundVotingPhase } from "./round-voting-phase";
import { VotingReveal } from "./voting-reveal";
import type { FinalizeResponse } from "@/lib/types/round";

export function RoundClient() {
  const { group } = useGroup();
  const isAdmin = group.invite_code !== null;
  const { round, loading, error, refetch } = useCurrentRound(group.id);
  const [revealSeen, setRevealSeen] = useState(false);

  useEffect(() => {
    if (round?.id) {
      const seen = sessionStorage.getItem(`reveal-seen:${round.id}`);
      if (seen) setRevealSeen(true);
    }
  }, [round?.id]);

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

  if (round.status === "nominating") {
    return (
      <RoundNominatingPhase
        round={round}
        isAdmin={isAdmin}
        refetch={refetch}
        group={group}
      />
    );
  }

  if (round.status === "voting") {
    return (
      <RoundVotingPhase
        round={round}
        isAdmin={isAdmin}
        refetch={refetch}
        group={group}
        onFinalized={(_result: FinalizeResponse) => refetch()}
      />
    );
  }

  if (round.status === "reading" && round.tiebreak_info !== null && !revealSeen) {
    return (
      <VotingReveal
        nominations={round.nominations}
        winnerNominationId={round.tiebreak_info.winner_id}
        wasTiebreak={round.tiebreak_info.was_tiebreak}
        members={group.members}
        onComplete={() => {
          sessionStorage.setItem(`reveal-seen:${round.id}`, "1");
          setRevealSeen(true);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <RoundStatusBadge round={round} />
      <p className="text-sm text-muted-foreground">
        {round.status === "reading" && "Leitura em andamento."}
        {round.status === "reviewing" && "Fase de reviews em andamento."}
        {round.status === "finished" && "Esta rodada foi encerrada."}
      </p>
    </div>
  );
}
