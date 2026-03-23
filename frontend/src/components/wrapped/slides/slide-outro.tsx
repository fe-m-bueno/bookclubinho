"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import ReactConfetti from "react-confetti";
import {
  STAGGER_VARIANTS_NORMAL,
  STAGGER_VARIANTS_REDUCED,
} from "@/lib/motion-variants";
import { useWindowSize } from "@/hooks/use-window-size";
import { Button } from "@/components/ui/button";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideOutroProps {
  data: WrappedData;
  groupId: string;
  year: number;
}

export function SlideOutro({ data, groupId, year }: SlideOutroProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const variants = shouldReduce ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;
  const { width, height } = useWindowSize();
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-sm mx-auto text-center">
      {!shouldReduce && (
        <ReactConfetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={250}
          gravity={0.15}
        />
      )}

      <motion.div
        variants={variants.container}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-6"
      >
        <motion.p
          variants={variants.item}
          className="text-6xl"
          animate={shouldReduce ? {} : { rotate: [0, -10, 10, -8, 0] }}
          transition={shouldReduce ? {} : { delay: 0.5, duration: 0.6 }}
        >
          📚
        </motion.p>

        <motion.div variants={variants.item} className="space-y-3">
          <h2 className="text-4xl font-display font-black text-foreground leading-tight">
            Nos vemos no próximo livro!
          </h2>
          <p className="text-lg text-foreground/70">
            Foi um {year} incrível, {data.group_name}!
          </p>
        </motion.div>

        <motion.div
          variants={variants.item}
          className="grid grid-cols-3 gap-4 w-full"
        >
          <div className="bg-foreground/10 rounded-2xl p-4 text-center">
            <p className="text-2xl font-display font-black text-foreground">{data.total_books_read}</p>
            <p className="text-xs text-foreground/60 mt-0.5">livros</p>
          </div>
          <div className="bg-foreground/10 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-foreground">
              {data.total_pages.toLocaleString("pt-BR")}
            </p>
            <p className="text-xs text-foreground/60 mt-0.5">páginas</p>
          </div>
          <div className="bg-foreground/10 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-foreground">
              {Math.round(data.total_reading_hours)}h
            </p>
            <p className="text-xs text-foreground/60 mt-0.5">lendo</p>
          </div>
        </motion.div>

        <motion.div variants={variants.item}>
          <Button
            variant="secondary"
            size="lg"
            className="gap-2"
            onClick={() => router.push(`/groups/${groupId}`)}
          >
            Voltar ao grupo
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
