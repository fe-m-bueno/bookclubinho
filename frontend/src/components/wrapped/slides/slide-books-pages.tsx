"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion, useMotionValue, animate } from "framer-motion";
import type { WrappedData } from "@/lib/types/wrapped";

const formatPtBR = (n: number) => n.toLocaleString("pt-BR");

interface SlideBooksPageProps {
  data: WrappedData;
}

interface CountingNumberProps {
  to: number;
  reducedMotion: boolean;
  className?: string;
  formatter?: (n: number) => string;
}

function CountingNumber({ to, reducedMotion, className, formatter }: CountingNumberProps) {
  const motionValue = useMotionValue(reducedMotion ? to : 0);
  const [display, setDisplay] = useState(() => {
    const initial = reducedMotion ? to : 0;
    return formatter ? formatter(initial) : String(Math.round(initial));
  });

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(formatter ? formatter(to) : String(Math.round(to)));
      return;
    }
    const controls = animate(motionValue, to, { duration: 1.2, ease: "easeOut" });
    const unsub = motionValue.on("change", (v) => {
      setDisplay(formatter ? formatter(Math.round(v)) : String(Math.round(v)));
    });
    return () => {
      controls.stop();
      unsub();
    };
  }, [motionValue, to, reducedMotion, formatter]);

  return <span className={className}>{display}</span>;
}

export function SlideBookPages({ data }: SlideBooksPageProps) {
  const shouldReduce = useReducedMotion() ?? false;

  return (
    <div className="flex flex-col items-center justify-center gap-10 w-full max-w-sm mx-auto text-center">
      <motion.p
        className="text-5xl"
        initial={shouldReduce ? {} : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={shouldReduce ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 15 }}
      >
        📚
      </motion.p>

      <motion.div
        className="space-y-2"
        initial={shouldReduce ? {} : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.2 }}
      >
        <p className="text-sm font-medium text-foreground/60 uppercase tracking-widest">
          Vocês leram
        </p>
        <div className="flex flex-col items-center">
          <CountingNumber
            to={data.total_books_read}
            reducedMotion={shouldReduce}
            className="text-8xl font-black tabular-nums text-foreground"
          />
          <p className="text-2xl font-semibold text-foreground/70 mt-1">
            {data.total_books_read === 1 ? "livro" : "livros"}
          </p>
        </div>
      </motion.div>

      <motion.div
        className="bg-foreground/10 rounded-2xl px-8 py-5 space-y-1"
        initial={shouldReduce ? {} : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.5 }}
      >
        <p className="text-sm text-foreground/60 uppercase tracking-widest">
          Isso representa
        </p>
        <div className="flex items-baseline gap-2 justify-center">
          <CountingNumber
            to={data.total_pages}
            reducedMotion={shouldReduce}
            className="text-4xl font-bold tabular-nums text-foreground"
            formatter={formatPtBR}
          />
          <span className="text-xl font-semibold text-foreground/70">páginas</span>
        </div>
      </motion.div>
    </div>
  );
}
