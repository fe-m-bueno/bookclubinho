import type { Variants } from "framer-motion";

export const SPRING_TRANSITION = {
  type: "spring" as const,
  stiffness: 300,
  damping: 28,
};

export const STAGGER_VARIANTS_NORMAL = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.25, ease: "easeOut" },
    },
  } satisfies Variants,
};

export const STAGGER_VARIANTS_REDUCED = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 1, y: 0 },
    visible: { opacity: 1, y: 0, transition: { duration: 0 } },
  } satisfies Variants,
};
