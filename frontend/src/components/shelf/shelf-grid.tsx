"use client";

import { useMemo } from "react";
import { useReducedMotion, motion } from "framer-motion";
import { BookShelfCard } from "./book-shelf-card";
import type { ShelfBook } from "@/lib/types/shelf";

interface ShelfGridProps {
  books: ShelfBook[];
  groupId?: string;
}

const VARIANTS_NORMAL = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  },
};

const VARIANTS_REDUCED = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0 } },
  },
  item: {
    hidden: { opacity: 1, y: 0 },
    visible: { opacity: 1, y: 0, transition: { duration: 0 } },
  },
};

export function ShelfGrid({ books, groupId }: ShelfGridProps) {
  const prefersReducedMotion = useReducedMotion();
  const v = prefersReducedMotion ? VARIANTS_REDUCED : VARIANTS_NORMAL;

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
