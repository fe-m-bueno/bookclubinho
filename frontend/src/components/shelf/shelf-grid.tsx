"use client";

import { useReducedMotion, motion } from "framer-motion";
import { BookShelfCard } from "./book-shelf-card";
import { STAGGER_VARIANTS_NORMAL, STAGGER_VARIANTS_REDUCED } from "@/lib/motion-variants";
import type { ShelfBook } from "@/lib/types/shelf";

interface ShelfGridProps {
  books: ShelfBook[];
  groupId?: string;
}

export function ShelfGrid({ books, groupId }: ShelfGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const v = prefersReducedMotion ? STAGGER_VARIANTS_REDUCED : STAGGER_VARIANTS_NORMAL;

  return (
    <motion.div
      variants={v.container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-40px" }}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
    >
      {books.map((book, i) => (
        <motion.div
          key={`${book.book_title}-${book.finished_at}-${i}`}
          variants={v.item}
        >
          <BookShelfCard book={book} groupId={groupId} />
        </motion.div>
      ))}
    </motion.div>
  );
}
