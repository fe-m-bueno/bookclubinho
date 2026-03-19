"use client";

import { Timer } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function FloatingTimerButton() {
  return (
    <motion.div
      className="fixed bottom-20 right-4 z-40"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.5, type: "spring", stiffness: 400, damping: 30 }}
    >
      <Button
        size="icon-lg"
        className="rounded-full shadow-lg h-14 w-14"
        onClick={() => toast.info("Timer de leitura em breve!")}
        aria-label="Timer de leitura"
      >
        <Timer className="h-5 w-5" />
      </Button>
    </motion.div>
  );
}
