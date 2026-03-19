import { Badge } from "@/components/ui/badge";
import type { RoundDetailResponse, RoundStatus } from "@/lib/types/round";

interface RoundStatusBadgeProps {
  round: RoundDetailResponse;
}

const STATUS_LABELS: Record<RoundStatus, string> = {
  nominating: "Fase de indicações",
  voting: "Fase de votação",
  reading: "Leitura em andamento",
  reviewing: "Fase de reviews",
  finished: "Encerrada",
};

export function RoundStatusBadge({ round }: RoundStatusBadgeProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        Rodada #{round.round_number}
      </p>
      <Badge variant="secondary" className="w-fit text-sm px-3 py-1">
        {STATUS_LABELS[round.status] ?? round.status}
      </Badge>
    </div>
  );
}
