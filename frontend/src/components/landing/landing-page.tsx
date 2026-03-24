"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const stagger = 0.08;
const fadeDuration = 0.6;

function Ornament({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M0 6h48m24 0h48M56 2l4 4-4 4m8-8l-4 4 4 4"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FloatingBook({
  className,
  delay,
  rotate,
}: {
  className?: string;
  delay: number;
  rotate: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : {
            delay: delay + 0.8,
            duration: 1.2,
            ease: "easeOut",
          }
      }
      aria-hidden="true"
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -6, 0] }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
          delay,
        }}
        style={{ rotate }}
        className="w-8 h-12 rounded-sm shadow-warm-md bg-gradient-to-b from-sage-200 to-sage-300 dark:from-sage-700 dark:to-sage-800 border border-sage-300/50 dark:border-sage-600/30"
      >
        <div className="mt-2 mx-1.5 space-y-0.5">
          <div className="h-px bg-sage-500/30 dark:bg-sage-400/20" />
          <div className="h-px bg-sage-500/20 dark:bg-sage-400/15 w-3/4" />
          <div className="h-px bg-sage-500/15 dark:bg-sage-400/10 w-1/2" />
        </div>
      </motion.div>
    </motion.div>
  );
}

export function LandingPage() {
  const reduced = useReducedMotion();

  const item = (i: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 16 },
    animate: { opacity: 1, y: 0 },
    transition: reduced
      ? { duration: 0 }
      : {
        delay: i * stagger,
        duration: fadeDuration,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
  });

  return (
    <div
      className="relative h-dvh w-full overflow-hidden flex flex-col items-center justify-center px-6 bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,oklch(0.94_0.03_78)_0%,oklch(0.96_0.015_78)_60%,oklch(0.93_0.02_152_/_8%)_100%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_40%,oklch(0.20_0.015_76)_0%,oklch(0.17_0.01_75)_60%,oklch(0.22_0.03_152_/_6%)_100%)]"
    >
      {/* Theme toggle */}
      <div className="absolute top-5 right-5 z-10">
        <ThemeToggle />
      </div>

      {/* Floating decorative books */}
      <FloatingBook
        className="absolute top-[12%] left-[8%] opacity-40 sm:opacity-50"
        delay={0}
        rotate={-12}
      />
      <FloatingBook
        className="absolute top-[18%] right-[10%] opacity-30 sm:opacity-40"
        delay={0.5}
        rotate={8}
      />
      <FloatingBook
        className="absolute bottom-[15%] left-[12%] opacity-25 sm:opacity-35"
        delay={1}
        rotate={-6}
      />
      <FloatingBook
        className="absolute bottom-[20%] right-[8%] opacity-35 sm:opacity-45"
        delay={1.5}
        rotate={15}
      />
      <FloatingBook
        className="hidden sm:block absolute top-[45%] left-[5%] opacity-20"
        delay={0.7}
        rotate={-20}
      />
      <FloatingBook
        className="hidden sm:block absolute top-[40%] right-[5%] opacity-25"
        delay={1.2}
        rotate={10}
      />

      {/* Main content */}
      <div className="relative z-[1] flex flex-col items-center text-center max-w-lg">
        {/* Top ornament */}
        <motion.div {...item(0)}>
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 mb-6 sm:mb-8" />
        </motion.div>

        {/* Icon */}
        <motion.div {...item(1)} className="mb-4 sm:mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-sage-100 dark:bg-sage-900/50 border border-sage-200/60 dark:border-sage-700/30 shadow-warm-sm">
            <BookOpen
              className="w-7 h-7 sm:w-8 sm:h-8 text-sage-600 dark:text-sage-400"
              strokeWidth={1.5}
            />
          </div>
        </motion.div>

        {/* Overline */}
        <motion.p
          {...item(2)}
          className="text-[0.7rem] sm:text-xs font-medium tracking-[0.25em] uppercase text-muted-foreground mb-3 sm:mb-4"
        >
          Clube do Livro
        </motion.p>

        {/* Title */}
        <motion.h1
          {...item(3)}
          className="font-display text-[2.5rem] sm:text-5xl md:text-6xl leading-[1.05] tracking-tight text-foreground mb-4 sm:mb-5"
        >
          Leia junto.
          <br />
          <span className="text-primary">Sinta junto.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...item(4)}
          className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xs sm:max-w-md mb-6 sm:mb-8"
        >
          O jeito mais fácil de manter um clube do livro. Porque ler
          sozinho é só metade da história.
        </motion.p>

        {/* Divider */}
        <motion.div
          {...item(5)}
          className="w-full max-w-[200px] mb-6 sm:mb-8"
        >
          <div className="divider-ornament">
            <span></span>
          </div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          {...item(6)}
          className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
        >
          <Button
            asChild
            size="lg"
            className="h-12 px-8 text-base rounded-xl shadow-warm-md hover:shadow-warm-lg transition-shadow"
          >
            <Link href="/auth/register">Criar meu clube</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 px-8 text-base rounded-xl"
          >
            <Link href="/auth/login">Já tenho conta</Link>
          </Button>
        </motion.div>

        {/* Bottom ornament */}
        <motion.div {...item(7)} className="mt-8 sm:mt-10">
          <Ornament className="w-24 sm:w-28 text-brand-400 dark:text-brand-500 rotate-180" />
        </motion.div>
      </div>

      {/* Bottom subtle attribution */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={reduced ? { duration: 0 } : { delay: 1.2, duration: 0.8 }}
        className="absolute bottom-5 text-[0.65rem] tracking-widest uppercase text-muted-foreground/50"
      >
        bookclubinho
      </motion.p>
    </div>
  );
}
