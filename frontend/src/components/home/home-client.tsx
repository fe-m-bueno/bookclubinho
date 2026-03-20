"use client";

import { useState } from "react";
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
import { HomeSkeleton } from "./home-skeleton";
import { HomeEmptyState } from "./home-empty-state";
import { UserMenu } from "./user-menu";
import { GroupHomeCard } from "./group-home-card";
import { UpcomingMeetingPill } from "./upcoming-meeting-pill";
import { RecentBadgeCard } from "./recent-badge-card";
import { SpeedDialFAB } from "./speed-dial-fab";
import { JoinGroupDialog } from "./join-group-dialog";

export function HomeClient() {
  const [joinOpen, setJoinOpen] = useState(false);
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  const userQuery = useCurrentUser();
  const groupsQuery = useHomeGroups();
  const meetingsQuery = useUpcomingMeetings(3);
  const badgesQuery = useRecentBadges(3);

  const isLoading =
    userQuery.isLoading || groupsQuery.isLoading;

  if (isLoading) return <HomeSkeleton />;

  const user = userQuery.data;
  const groups = groupsQuery.data?.groups ?? [];
  const meetings = meetingsQuery.data?.meetings ?? [];
  const badges = badgesQuery.data?.badges ?? [];

  if (!user) return null;

  const greeting = getGreeting(user.timezone);
  const firstName =
    user.display_name?.split(" ")[0] ?? user.username ?? "você";

  if (groups.length === 0) {
    return (
      <>
        <div className="flex min-h-screen flex-col bg-background">
          <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur">
            <div className="mx-auto flex max-w-lg items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{greeting}</p>
                <h1 className="text-lg font-bold">{firstName}</h1>
              </div>
              <UserMenu user={user} />
            </div>
          </header>
          <main className="mx-auto w-full max-w-lg flex-1 px-4">
            <HomeEmptyState
              onCreateGroup={() => (window.location.href = "/groups/new")}
              onJoinGroup={() => setJoinOpen(true)}
            />
          </main>
        </div>
        <JoinGroupDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/80 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{greeting}</p>
            <h1 className="text-lg font-bold text-foreground">{firstName}</h1>
          </div>
          <UserMenu user={user} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-6 px-4 py-6">
        {/* Groups */}
        <section aria-labelledby="groups-heading">
          <h2
            id="groups-heading"
            className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Meus clubes
          </h2>
          <motion.ul
            variants={variants.container}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {groups.map((group) => (
              <motion.li key={group.id} variants={variants.item}>
                <GroupHomeCard group={group} />
              </motion.li>
            ))}
          </motion.ul>
        </section>

        {/* Upcoming meetings */}
        {meetings.length > 0 && (
          <section aria-labelledby="meetings-heading">
            <h2
              id="meetings-heading"
              className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Próximos encontros
            </h2>
            <motion.ul
              variants={variants.container}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {meetings.map((meeting) => (
                <motion.li key={meeting.id} variants={variants.item}>
                  <UpcomingMeetingPill meeting={meeting} />
                </motion.li>
              ))}
            </motion.ul>
          </section>
        )}

        {/* Recent badges */}
        {badges.length > 0 && (
          <section aria-labelledby="badges-heading">
            <h2
              id="badges-heading"
              className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Conquistas recentes
            </h2>
            <motion.ul
              variants={variants.container}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {badges.map((badge) => (
                <motion.li key={badge.slug} variants={variants.item}>
                  <RecentBadgeCard badge={badge} />
                </motion.li>
              ))}
            </motion.ul>
          </section>
        )}
      </main>

      <SpeedDialFAB />
    </div>
  );
}
