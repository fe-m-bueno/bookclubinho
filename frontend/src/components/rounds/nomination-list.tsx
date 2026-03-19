"use client";

import { AnimatePresence } from "framer-motion";
import { NominationCard } from "./nomination-card";
import { NominationEmptyState } from "./nomination-empty-state";
import type { NominationSummary } from "@/lib/types/round";
import type { MemberSummary } from "@/lib/types/group";

interface NominationListProps {
  nominations: NominationSummary[];
  members: MemberSummary[];
  currentUserId: string;
  roundId: string;
  onRemoved: () => void;
}

export function NominationList({
  nominations,
  members,
  currentUserId,
  roundId,
  onRemoved,
}: NominationListProps) {
  const memberMap = new Map(members.map((m) => [m.user_id, m]));

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">
        Indicações ({nominations.length})
      </h2>

      {nominations.length === 0 ? (
        <NominationEmptyState />
      ) : (
        <AnimatePresence mode="popLayout">
          {nominations.map((nom) => {
            const m = memberMap.get(nom.user_id);
            const nominatorName = m?.display_name ?? m?.username ?? "Membro";
            return (
              <NominationCard
                key={nom.id}
                nomination={nom}
                nominatorName={nominatorName}
                currentUserId={currentUserId}
                roundId={roundId}
                onRemoved={onRemoved}
              />
            );
          })}
        </AnimatePresence>
      )}
    </section>
  );
}
