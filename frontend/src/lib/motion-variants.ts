import type { Variants } from "framer-motion";

interface StaggerVariants {
  container: Variants;
  item: Variants;
}

export const STAGGER_VARIANTS_NORMAL: StaggerVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  },
};

export const STAGGER_VARIANTS_REDUCED: StaggerVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.15 } },
  },
  item: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.1 } },
  },
};
