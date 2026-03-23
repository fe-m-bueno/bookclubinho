"use client";

import { useState, useEffect } from "react";
import { useReducedMotion, motion, useMotionValue, animate } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import type { GroupStatsResponse } from "@/lib/types/stats";

interface StatsOverviewCardsProps {
  data: GroupStatsResponse;
}

const CONTAINER_VARIANTS = {
  normal: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  },
  reduced: {
    hidden: {},
    visible: { transition: { staggerChildren: 0 } },
  },
};

const ITEM_VARIANTS = {
  normal: {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  },
  reduced: {
    hidden: { opacity: 1, y: 0 },
    visible: { opacity: 1, y: 0, transition: { duration: 0 } },
  },
};

interface CountingCardProps {
  label: string;
  to: number;
  decimals?: number;
  suffix?: string;
  reducedMotion: boolean;
}

function CountingCard({ label, to, decimals = 0, suffix = "", reducedMotion }: CountingCardProps) {
  const motionValue = useMotionValue(reducedMotion ? to : 0);
  const [display, setDisplay] = useState(() =>
    reducedMotion ? to.toFixed(decimals) : (0).toFixed(decimals),
  );

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(to.toFixed(decimals));
      return;
    }
    const controls = animate(motionValue, to, {
      duration: 0.8,
      ease: "easeOut",
    });
    const unsub = motionValue.on("change", (v) => setDisplay(v.toFixed(decimals)));
    return () => {
      controls.stop();
      unsub();
    };
  }, [motionValue, to, decimals, reducedMotion]);

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-3xl font-display font-bold tabular-nums">
          {display}
          {suffix}
        </p>
      </CardContent>
    </Card>
  );
}

export function StatsOverviewCards({ data }: StatsOverviewCardsProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const cv = prefersReducedMotion ? CONTAINER_VARIANTS.reduced : CONTAINER_VARIANTS.normal;
  const iv = prefersReducedMotion ? ITEM_VARIANTS.reduced : ITEM_VARIANTS.normal;

  const hoursRead = data.total_reading_time_minutes / 60;

  return (
    <motion.div
      variants={cv}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
    >
      <motion.div variants={iv}>
        <CountingCard
          label="Livros lidos"
          to={data.total_books_read}
          reducedMotion={prefersReducedMotion}
        />
      </motion.div>

      <motion.div variants={iv}>
        <CountingCard
          label="Páginas"
          to={data.total_pages_read}
          reducedMotion={prefersReducedMotion}
        />
      </motion.div>

      <motion.div variants={iv}>
        {data.average_rating !== null ? (
          <CountingCard
            label="Nota média"
            to={data.average_rating}
            decimals={1}
            suffix=" ★"
            reducedMotion={prefersReducedMotion}
          />
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Nota média</p>
              <p className="text-3xl font-display font-bold">—</p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <motion.div variants={iv}>
        <CountingCard
          label="Horas lidas"
          to={hoursRead}
          decimals={1}
          suffix="h"
          reducedMotion={prefersReducedMotion}
        />
      </motion.div>
    </motion.div>
  );
}
