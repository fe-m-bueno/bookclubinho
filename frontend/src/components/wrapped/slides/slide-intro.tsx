"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideIntroProps {
  data: WrappedData;
}

export function SlideIntro({ data }: SlideIntroProps) {
  const shouldReduce = useReducedMotion();
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  const visibleAvatars = data.member_avatars.slice(0, 8);

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-sm mx-auto text-center">
      <motion.div
        variants={variants.container}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-6"
      >
        <motion.div variants={variants.item}>
          <p className="text-6xl">✨</p>
        </motion.div>

        <motion.div variants={variants.item} className="space-y-2">
          <h1 className="text-4xl font-display font-bold tracking-tight text-foreground">
            {data.group_name}
          </h1>
          <p className="text-2xl font-display font-semibold text-foreground/70">
            Wrapped {data.year}
          </p>
        </motion.div>

        {visibleAvatars.length > 0 && (
          <motion.div
            variants={variants.item}
            className="flex flex-wrap justify-center gap-2"
          >
            {visibleAvatars.map((member) => (
              <div
                key={member.user_id}
                className="w-11 h-11 rounded-full overflow-hidden bg-muted border-2 border-background shadow-sm flex items-center justify-center"
                title={member.display_name ?? member.username}
              >
                {member.avatar_url ? (
                  <Image
                    src={member.avatar_url}
                    alt={member.display_name ?? member.username}
                    width={44}
                    height={44}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground">
                    {(member.display_name ?? member.username)
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        )}

        <motion.div variants={variants.item}>
          <p className="text-sm text-foreground/60">
            Deslize para começar →
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
