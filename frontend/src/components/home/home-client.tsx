"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useHomeGroups } from "@/hooks/use-home-groups";
import { useUpcomingMeetings } from "@/hooks/use-upcoming-meetings";
import { useRecentBadges } from "@/hooks/use-recent-badges";
import { getGreeting } from "@/lib/greeting";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { HomeSkeleton } from "./home-skeleton";
import { HomeColumns, HomeHeader, HomeMain, HomeShell } from "./home-shell";
import { HomeEmptyState } from "./home-empty-state";
import { UserMenu } from "./user-menu";
import { GroupHomeCard } from "./group-home-card";
import { HomeStateRail } from "./home-state-rail";
import { SpeedDialFAB } from "./speed-dial-fab";
import { JoinGroupDialog } from "./join-group-dialog";

/** Enquanto a conquista é notícia. Passado isso, ela vive no perfil. */
const RECENT_BADGE_WINDOW_DAYS = 7;

export function HomeClient() {
  const [joinOpen, setJoinOpen] = useState(false);
  const router = useRouter();
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce
    ? STAGGER_VARIANTS_REDUCED
    : STAGGER_VARIANTS_NORMAL;

  const userQuery = useCurrentUser();
  const groupsQuery = useHomeGroups();
  const meetingsQuery = useUpcomingMeetings(3);
  // Sete dias: conquista é evento, e um evento de meio ano atrás não é
  // notícia. Fora da janela ela segue no perfil e em /badges.
  const badgesQuery = useRecentBadges(3, RECENT_BADGE_WINDOW_DAYS);

  const isLoading = userQuery.isLoading || groupsQuery.isLoading;
  const { showSkeleton } = useSkeletonState(isLoading);

  if (showSkeleton) return <HomeSkeleton />;
  if (isLoading) return null;

  const user = userQuery.data;
  const groups = groupsQuery.data?.groups ?? [];
  const meetings = meetingsQuery.data?.meetings ?? [];
  const badges = badgesQuery.data?.badges ?? [];

  if (!user) return null;

  const greeting = getGreeting(user.timezone);
  const firstName =
    user.display_name?.split(" ")[0] ?? user.username ?? "you";

  if (groups.length === 0) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background">
          {/* `px-6` no mesmo elemento do `max-w-2xl`, como no main logo
              abaixo. Separados, o header recuava de uma borda e o main de
              outra — 24px de diferença que aqui não aparece só porque o estado
              vazio centraliza tudo, e apareceria no dia em que alguém
              alinhasse algo à esquerda. É o mesmo erro que o `HomeShell`
              corrigiu para a home com clubes. */}
          <header className="mx-auto w-full max-w-2xl px-6 pt-10 pb-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{greeting}</p>
                <h1 className="mt-1 text-3xl font-display font-bold tracking-tight md:text-4xl">
                  {firstName}
                </h1>
              </div>
              <UserMenu user={user} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-2xl flex-1 px-6">
            <HomeEmptyState
              onCreateGroup={() => router.push("/groups/create")}
              onJoinGroup={() => setJoinOpen(true)}
            />
          </main>
        </div>
        <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </>
    );
  }

  return (
    <HomeShell>
      {/* Greeting — warm, personal, large */}
      <HomeHeader>
        <div>
          <p className="text-sm text-muted-foreground">{greeting}</p>
          <h1 className="mt-1 text-3xl font-display font-bold tracking-tight md:text-4xl">
            {firstName}
          </h1>
        </div>
        <UserMenu user={user} />
      </HomeHeader>

      <HomeMain>
        <HomeColumns
          rail={
            <HomeStateRail user={user} meetings={meetings} badges={badges} />
          }
        >
          <section>
            <h2 className="divider-ornament mb-6">meus clubes</h2>
            <motion.ul
              variants={variants.container}
              initial="hidden"
              animate="visible"
              // Mais respiro que antes: o card ganhou um rodapé com fundo
              // próprio, e com `space-y-4` a faixa de um card quase encostava
              // na borda do seguinte.
              className="space-y-5"
            >
              {groups.map((group) => (
                <motion.li key={group.id} variants={variants.item}>
                  <GroupHomeCard group={group} />
                </motion.li>
              ))}
            </motion.ul>
          </section>
        </HomeColumns>
      </HomeMain>

      <SpeedDialFAB />
    </HomeShell>
  );
}
