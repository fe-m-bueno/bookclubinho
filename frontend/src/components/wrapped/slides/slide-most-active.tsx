"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideMostActiveProps {
  data: WrappedData;
}

export function SlideMostActive({ data }: SlideMostActiveProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const member = data.most_active_member;

  if (!member) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">🏆</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Nenhum membro ativo ainda</h2>
      </div>
    );
  }

  const displayName = member.display_name ?? member.username;

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-sm mx-auto text-center">
      <motion.p
        className="text-sm font-semibold text-foreground/60 uppercase tracking-widest"
        initial={shouldReduce ? {} : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        Membro mais ativo
      </motion.p>

      <motion.div
        className="flex flex-col items-center gap-4"
        initial={shouldReduce ? {} : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          shouldReduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 180, damping: 14, delay: 0.15 }
        }
      >
        <div className="relative">
          <div className="w-28 h-28 rounded-full overflow-hidden bg-muted border-4 border-background shadow-xl flex items-center justify-center">
            {member.avatar_url ? (
              <Image
                src={member.avatar_url}
                alt={displayName}
                width={112}
                height={112}
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-4xl font-black text-muted-foreground">
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <motion.div
            className="absolute -top-2 -right-2 text-3xl"
            animate={shouldReduce ? {} : { rotate: [0, -15, 15, -10, 0] }}
            transition={shouldReduce ? {} : { delay: 0.7, duration: 0.6 }}
          >
            🏆
          </motion.div>
        </div>

        <div className="space-y-1">
          <h2 className="text-3xl font-display font-black text-foreground">{displayName}</h2>
          <p className="text-base text-foreground/60">@{member.username}</p>
        </div>
      </motion.div>

      <motion.div
        className="bg-foreground/10 rounded-2xl px-8 py-4"
        initial={shouldReduce ? {} : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.5 }}
      >
        <p className="text-foreground/80 text-base">
          O leitor mais dedicado do grupo em {data.year}
        </p>
      </motion.div>
    </div>
  );
}
