"use client";

import { useReducedMotion, motion } from "framer-motion";
import { QuoteCard } from "./quote-card";
import { STAGGER_VARIANTS_NORMAL, STAGGER_VARIANTS_REDUCED } from "@/lib/motion-variants";
import type { QuoteResponse } from "@/lib/types/quote";

interface QuoteMasonryGridProps {
  quotes: QuoteResponse[];
  currentUserId: string;
  onVoteToggle: (id: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  onSelect: (q: QuoteResponse) => void;
}

export function QuoteMasonryGrid({
  quotes,
  currentUserId,
  onVoteToggle,
  onDelete,
  onSelect,
}: QuoteMasonryGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const v = prefersReducedMotion ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  return (
    <motion.div
      variants={v.container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="columns-1 sm:columns-2 lg:columns-3 gap-4"
    >
      {quotes.map((quote) => (
        <motion.div key={quote.id} variants={v.item}>
          <QuoteCard
            quote={quote}
            currentUserId={currentUserId}
            onVoteToggle={onVoteToggle}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        </motion.div>
      ))}
    </motion.div>
  );
}
