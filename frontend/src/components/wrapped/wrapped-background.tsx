"use client";

import { motion, useReducedMotion } from "framer-motion";

export function WrappedBackground() {
  const shouldReduce = useReducedMotion();
  return (
    <motion.div
      className="absolute inset-0 -z-10"
      style={{
        background:
          "linear-gradient(135deg, oklch(0.90 0.04 152) 0%, oklch(0.85 0.06 78) 33%, oklch(0.80 0.05 100) 66%, oklch(0.88 0.04 55) 100%)",
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
