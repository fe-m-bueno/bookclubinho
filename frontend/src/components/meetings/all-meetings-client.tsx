"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Calendar } from "lucide-react";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { useUpcomingMeetings } from "@/hooks/use-upcoming-meetings";
import { UpcomingMeetingPill } from "@/components/home/upcoming-meeting-pill";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import { Skeleton } from "@/components/ui/skeleton";

function AllMeetingsSkeleton() {
  return (
    <div className="space-y-2" aria-label="Carregando encontros">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
      ))}
    </div>
  );
}

export function AllMeetingsClient() {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;
  const { data, isLoading } = useUpcomingMeetings(50);
  const { showSkeleton } = useSkeletonState(isLoading);

  if (showSkeleton) return <AllMeetingsSkeleton />;

  const meetings = data?.meetings ?? [];

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground text-sm">
          Nenhum encontro agendado
        </p>
      </div>
    );
  }

  return (
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
  );
}
