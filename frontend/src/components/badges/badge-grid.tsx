"use client";

import { useReducedMotion, motion } from "framer-motion";
import { BadgeCard } from "./badge-card";
import { STAGGER_VARIANTS_NORMAL, STAGGER_VARIANTS_REDUCED } from "@/lib/motion-variants";
import type { BadgeResponse } from "@/lib/types/badge";

interface BadgeGridProps {
  badges: Array<BadgeResponse & { isEarned: boolean }>;
}

export function BadgeGrid({ badges }: BadgeGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const v = prefersReducedMotion ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  return (
    <motion.div
      variants={v.container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3"
    >
      {badges.map((badge) => (
        <motion.div key={badge.slug} variants={v.item}>
          <BadgeCard
            badge={badge}
            isEarned={badge.isEarned}
            earnedAt={badge.earned_at}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
