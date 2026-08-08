"use client";

import { Flame, Clock, Trophy } from "lucide-react";
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
      {/* Um card com três linhas, e não dois quadrados lado a lado: os tiles
          somavam 76px de altura ao lado de uma lista de clubes de 600px, e a
          coluna lia como um toco. O recorde saiu de dica em letra miúda e
          virou linha — é um número que a pessoa quer bater. */}
      <section>
        <RailHeading>Você</RailHeading>
        <div className="divide-y rounded-xl border bg-card">
          <StatRow
            icon={<Flame className="size-4 text-sage-600 dark:text-sage-400" />}
            label="Sequência"
            value={`${user.streak_current} ${user.streak_current === 1 ? "dia" : "dias"}`}
          />
          <StatRow
            icon={<Trophy className="size-4 text-sage-600 dark:text-sage-400" />}
            label="Recorde"
            value={`${user.streak_longest} ${user.streak_longest === 1 ? "dia" : "dias"}`}
          />
          <StatRow
            icon={<Clock className="size-4 text-sage-600 dark:text-sage-400" />}
            label="Tempo lendo"
            value={formatReadingTime(user.total_reading_time_minutes)}
          />
        </div>
      </section>

      {/* Ao contrário das conquistas, esta seção fica mesmo sem dado: "nada
          marcado" é uma resposta, e a agenda vazia é justamente o que faz
          alguém marcar um encontro. Sumir com ela devolveria à coluna o buraco
          que o trilho existe para não ter. */}
      <section>
        <RailHeading>
          {meetings.length > 1 ? "Próximos encontros" : "Próximo encontro"}
        </RailHeading>
        {meetings.length > 0 ? (
          <ul className="space-y-2">
            {meetings.map((meeting) => (
              <li key={meeting.id}>
                <UpcomingMeetingPill meeting={meeting} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
            Nenhum encontro marcado
          </p>
        )}
      </section>

      {/* Conquista é evento: a seção só existe enquanto a badge é notícia. A
          janela de dias é pedida ao backend em `use-recent-badges`; passada
          ela, as conquistas vivem no perfil e em /badges. */}
      {badges.length > 0 && (
        <section>
          <RailHeading>
            {badges.length === 1 ? "Conquista nova" : "Conquistas novas"}
          </RailHeading>
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

function RailHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="font-display font-bold tabular-nums">{value}</span>
    </div>
  );
}
