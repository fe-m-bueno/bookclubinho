"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideTopRatedProps {
  data: WrappedData;
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.5;
  return (
    <div className="flex gap-0.5 justify-center" aria-label={`${rating.toFixed(1)} estrelas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`text-2xl ${i < full ? "text-yellow-500" : i === full && hasHalf ? "text-yellow-400 opacity-70" : "text-foreground/20"}`}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export function SlideTopRated({ data }: SlideTopRatedProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const book = data.highest_rated_book;

  if (!book) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">📖</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Nenhum livro avaliado ainda</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full max-w-sm mx-auto text-center">
      <motion.p
        className="text-sm font-semibold text-foreground/60 uppercase tracking-widest"
        initial={shouldReduce ? {} : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        Melhor avaliado
      </motion.p>

      <motion.div
        className="relative"
        initial={shouldReduce ? {} : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          shouldReduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 180, damping: 14, delay: 0.15 }
        }
      >
        {book.cover_url ? (
          <div className="relative w-36 h-52 rounded-xl overflow-hidden shadow-2xl">
            <Image
              src={book.cover_url}
              alt={book.title}
              fill
              className="object-cover"
              sizes="144px"
            />
          </div>
        ) : (
          <div className="w-36 h-52 rounded-xl bg-foreground/10 flex items-center justify-center shadow-2xl">
            <span className="text-5xl">📖</span>
          </div>
        )}
        <motion.div
          className="absolute -top-3 -right-3 bg-yellow-400 rounded-full w-10 h-10 flex items-center justify-center shadow-lg text-lg"
          animate={shouldReduce ? {} : { rotate: [0, -10, 10, -10, 0] }}
          transition={shouldReduce ? {} : { delay: 0.8, duration: 0.5 }}
        >
          ★
        </motion.div>
      </motion.div>

      <motion.div
        className="space-y-2"
        initial={shouldReduce ? {} : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.3 }}
      >
        <h2 className="text-2xl font-display font-bold text-foreground leading-tight">{book.title}</h2>
        {book.author && (
          <p className="text-base text-foreground/60">{book.author}</p>
        )}
        <div className="flex flex-col items-center gap-1 mt-2">
          <StarRating rating={book.avg_rating} />
          <p className="text-xl font-bold text-foreground tabular-nums">
            {book.avg_rating.toFixed(1)} / 5
          </p>
        </div>
      </motion.div>
    </div>
  );
}
