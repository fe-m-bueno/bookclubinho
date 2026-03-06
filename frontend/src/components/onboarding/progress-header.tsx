"use client";

import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface ProgressHeaderProps {
  currentStep: number;
  stepLabels: string[];
  reduceMotion?: boolean;
}

export function ProgressHeader({
  currentStep,
  stepLabels,
  reduceMotion = false,
}: ProgressHeaderProps) {
  const progressValue = ((currentStep + 1) / stepLabels.length) * 100;

  return (
    <div className="space-y-3">
      <Progress value={progressValue} className="h-2" />
      <div className="flex justify-between">
        {stepLabels.map((label, i) => {
          const isActive = i === currentStep;
          const isPast = i < currentStep;
          return (
            <motion.span
              key={label}
              animate={{
                color: isActive
                  ? "var(--foreground)"
                  : "var(--muted-foreground)",
                scale: isActive ? 1.05 : 1,
              }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 500, damping: 30 }
              }
              className={`text-xs origin-center ${
                isActive
                  ? "font-semibold"
                  : isPast
                    ? "font-medium"
                    : "font-normal"
              }`}
            >
              {label}
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
