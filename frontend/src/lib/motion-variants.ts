import type { Variants } from "framer-motion";

export const STAGGER_VARIANTS_NORMAL = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.05 } },
  } satisfies Variants,
  item: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
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
