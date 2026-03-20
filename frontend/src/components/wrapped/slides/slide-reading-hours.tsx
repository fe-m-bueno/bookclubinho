"use client";

import { useState, useEffect } from "react";
import { motion, useReducedMotion, useMotionValue, animate } from "framer-motion";
import type { WrappedData } from "@/lib/types/wrapped";

interface SlideReadingHoursProps {
  data: WrappedData;
}

export function SlideReadingHours({ data }: SlideReadingHoursProps) {
  const shouldReduce = useReducedMotion() ?? false;
  const motionValue = useMotionValue(shouldReduce ? data.total_reading_hours : 0);
  const [display, setDisplay] = useState(() =>
    shouldReduce ? data.total_reading_hours.toFixed(1) : "0.0",
  );

  useEffect(() => {
    if (shouldReduce) {
      setDisplay(data.total_reading_hours.toFixed(1));
      return;
    }
    const controls = animate(motionValue, data.total_reading_hours, {
      duration: 1.5,
      ease: "easeOut",
    });
    const unsub = motionValue.on("change", (v) => setDisplay(v.toFixed(1)));
    return () => {
      controls.stop();
      unsub();
    };
  }, [motionValue, data.total_reading_hours, shouldReduce]);

  const days = (data.total_reading_hours / 24).toFixed(1);

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full max-w-sm mx-auto text-center">
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={shouldReduce ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.3 }}
      >
        <p className="text-sm font-semibold text-foreground/60 uppercase tracking-widest">
          Tempo de leitura
        </p>
      </motion.div>

      <motion.div
        className="flex flex-col items-center"
        initial={shouldReduce ? {} : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={
          shouldReduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 150, damping: 12, delay: 0.1 }
        }
      >
        <motion.p
          className="text-7xl"
          animate={shouldReduce ? {} : { scale: [1, 1.15, 1] }}
          transition={shouldReduce ? {} : { delay: 1.2, duration: 0.4, repeat: 2, repeatDelay: 0.3 }}
        >
          🔥
        </motion.p>
        <div className="flex items-baseline gap-2 mt-4">
          <span className="text-8xl font-black tabular-nums text-foreground">
            {display}
          </span>
          <span className="text-3xl font-bold text-foreground/70">h</span>
        </div>
      </motion.div>

      <motion.div
        className="bg-foreground/10 rounded-2xl px-8 py-4"
        initial={shouldReduce ? {} : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduce ? { duration: 0 } : { duration: 0.4, delay: 0.6 }}
      >
        <p className="text-foreground/70 text-base">
          O equivalente a{" "}
          <span className="font-bold text-foreground">{days} dias</span> lendo sem parar
        </p>
      </motion.div>
    </div>
  );
}
