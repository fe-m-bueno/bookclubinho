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
import { useSkeletonState } from "@/hooks/use-skeleton-state";
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
  const variants = shouldReduce
    ? STAGGER_VARIANTS_REDUCED
    : STAGGER_VARIANTS_NORMAL;

  const userQuery = useCurrentUser();
  const groupsQuery = useHomeGroups();
  const meetingsQuery = useUpcomingMeetings(3);
  const badgesQuery = useRecentBadges(3);

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
          <header className="px-6 pt-10 pb-2">
            <div className="mx-auto flex max-w-2xl items-end justify-between">
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
              onCreateGroup={() => (window.location.href = "/groups/create")}
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
      {/* Greeting — warm, personal, large */}
      <header className="px-6 pt-10 pb-8">
        <div className="mx-auto flex max-w-2xl items-end justify-between">
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
        {/* Groups */}
        <section>
          <h2 className="divider-ornament mb-6">meus clubes</h2>
          <motion.ul
            variants={variants.container}
            initial="hidden"
            animate="visible"
            className="space-y-4"
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
          <section className="mt-10">
            <h2 className="divider-ornament mb-6">encontros</h2>
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
          <section className="mt-10">
            <h2 className="divider-ornament mb-6">conquistas</h2>
            <motion.ul
              variants={variants.container}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {badges.map((badge, i) => (
                <motion.li key={`${badge.slug}-${i}`} variants={variants.item}>
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
