"use client";

import { motion, useReducedMotion } from "framer-motion";

export function WrappedBackground() {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0 -z-10"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.88 0.08 68) 0%, oklch(0.75 0.12 45) 33%, oklch(0.82 0.10 80) 66%, oklch(0.70 0.15 50) 100%)",
        backgroundSize: "400% 400%",
      }}
      animate={
        shouldReduce
          ? {}
          : {
              backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
            }
      }
      transition={
        shouldReduce
          ? {}
          : {
              duration: 15,
              ease: "linear",
              repeat: Infinity,
            }
      }
    />
  );
}
