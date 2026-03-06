"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface StepCompletePlaceholderProps {
  onBack: () => void;
}

const stagger = {
  visible: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function StepCompletePlaceholder({ onBack }: StepCompletePlaceholderProps) {
  return (
    <motion.div
      className="space-y-6 text-center py-8"
      variants={stagger}
      initial="hidden"
      animate="visible"
    >
      <div>
        <motion.p
          className="text-4xl"
          aria-hidden="true"
          variants={fadeUp}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          🎉
        </motion.p>
        <motion.h2
          className="text-lg font-semibold mt-3"
          variants={fadeUp}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          Tudo pronto!
        </motion.h2>
        <motion.p
          className="text-sm text-muted-foreground mt-1"
          variants={fadeUp}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
        >
          Em breve...
        </motion.p>
      </div>
      <motion.div
        className="flex gap-3"
        variants={fadeUp}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
      >
        <Button variant="outline" className="flex-1 h-11" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1 h-11" disabled>
          Concluir
        </Button>
      </motion.div>
    </motion.div>
  );
}
