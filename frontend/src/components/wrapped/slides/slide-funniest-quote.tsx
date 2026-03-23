"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideFunniestQuoteProps {
  data: WrappedData;
}

export function SlideFunniestQuote({ data }: SlideFunniestQuoteProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const quote = data.funniest_oneliner;

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 w-full max-w-sm mx-auto text-center">
        <p className="text-5xl">😂</p>
        <h2 className="text-2xl font-display font-bold text-foreground">Sem one-liners ainda</h2>
        <p className="text-base text-foreground/60">Escrevam reviews para aparecer aqui!</p>
      </div>
    );
  }

  const authorName = quote.author_display_name ?? quote.author_username;

  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full max-w-sm mx-auto">
      <motion.p
        className="text-sm font-semibold text-foreground/60 uppercase tracking-widest text-center"
        initial={shouldReduce ? {} : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        One-liner mais engraçado
      </motion.p>

      <motion.div
        className="relative bg-foreground/10 rounded-2xl p-6 w-full"
        initial={shouldReduce ? {} : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={
          shouldReduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 180, damping: 18, delay: 0.15 }
        }
      >
        <span className="absolute -top-4 left-4 text-5xl text-foreground/20 font-serif leading-none select-none">
          &ldquo;
        </span>
        <p className="text-xl font-serif font-semibold italic text-foreground leading-relaxed pt-4 px-2">
          {quote.text}
        </p>
        <span className="absolute -bottom-6 right-4 text-5xl text-foreground/20 font-serif leading-none select-none">
          &rdquo;
        </span>
      </motion.div>

      <motion.div
        className="flex items-center gap-3 mt-2"
        initial={shouldReduce ? {} : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.4 }}
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-muted border-2 border-background flex items-center justify-center flex-shrink-0">
          {quote.author_avatar_url ? (
            <Image
              src={quote.author_avatar_url}
              alt={authorName}
              width={36}
              height={36}
              className="object-cover w-full h-full"
            />
          ) : (
            <span className="text-sm font-bold text-muted-foreground">
              {authorName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-left">
          <p className="font-semibold text-sm text-foreground">{authorName}</p>
          {quote.vote_count > 0 && (
            <p className="text-xs text-foreground/50">
              {quote.vote_count} {quote.vote_count === 1 ? "voto" : "votos"}
            </p>
          )}
        </div>
        <span className="ml-auto text-2xl">😂</span>
      </motion.div>
    </div>
  );
}
