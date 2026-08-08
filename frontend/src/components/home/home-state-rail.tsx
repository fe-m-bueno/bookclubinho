"use client";

import { Flame, Clock } from "lucide-react";
import { formatReadingTime } from "@/lib/reading-time";
import { UpcomingMeetingPill } from "./upcoming-meeting-pill";
import { RecentBadgeCard } from "./recent-badge-card";
import type { UserMe } from "@/lib/types/user";
import type { UpcomingMeetingItem } from "@/lib/types/meeting";
import type { BadgeResponse } from "@/lib/types/badge";

interface HomeStateRailProps {
  user: UserMe;
  meetings: UpcomingMeetingItem[];
  badges: BadgeResponse[];
}

/**
 * O trilho de estado: o que se consulta de relance, separado do que se vem
 * fazer.
 *
 * Centro é ação (os clubes), trilho é estado. Empilhados numa coluna só, um
 * empurra o outro para fora da dobra — era o que as conquistas faziam com os
 * cards de clube.
 *
 * A sequência e o tempo de leitura vêm do `UserMe`, que a home já busca: são
 * dados sempre presentes, calculados com tratamento de fuso e testes
 * dedicados, e que a home nunca mostrou. O trilho, por causa deles, nunca
 * aparece vazio.
 */
export function HomeStateRail({ user, meetings, badges }: HomeStateRailProps) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Você
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            icon={<Flame className="size-4 text-sage-600 dark:text-sage-400" />}
            label="Sequência"
            value={`${user.streak_current} ${user.streak_current === 1 ? "dia" : "dias"}`}
            hint={
              user.streak_longest > user.streak_current
                ? `recorde: ${user.streak_longest}`
                : null
            }
          />
          <StatTile
            icon={<Clock className="size-4 text-sage-600 dark:text-sage-400" />}
            label="Leitura"
            value={formatReadingTime(user.total_reading_time_minutes)}
            hint={null}
          />
        </div>
      </section>

      {meetings.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {meetings.length === 1 ? "Próximo encontro" : "Próximos encontros"}
          </h2>
          <ul className="space-y-2">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <UpcomingMeetingPill meeting={meeting} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Conquista é evento: a seção só existe enquanto a badge é notícia. A
          janela de dias é pedida ao backend em `use-recent-badges`; passada
          ela, as conquistas vivem no perfil e em /badges. */}
      {badges.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {badges.length === 1 ? "Conquista nova" : "Conquistas novas"}
          </h2>
          <ul className="space-y-2">
            {badges.map((badge, i) => (
              <li key={`${badge.slug}-${badge.group_name ?? i}`}>
                <RecentBadgeCard badge={badge} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string | null;
}) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-display text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
