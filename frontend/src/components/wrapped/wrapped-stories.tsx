"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { WrappedBackground } from "./wrapped-background";
import { WrappedDots } from "./wrapped-dots";
import { WrappedShareButton } from "./wrapped-share-button";
import { SlideIntro } from "./slides/slide-intro";
import { SlideBookPages } from "./slides/slide-books-pages";
import { SlideTopRated } from "./slides/slide-top-rated";
import { SlideReadingHours } from "./slides/slide-reading-hours";
import { SlideMostActive } from "./slides/slide-most-active";
import { SlideFunniestQuote } from "./slides/slide-funniest-quote";
import { SlideGenreBreakdown } from "./slides/slide-genre-breakdown";
import { SlideEmotionalStats } from "./slides/slide-emotional-stats";
import { SlideSuperlatives } from "./slides/slide-superlatives";
import { SlideOutro } from "./slides/slide-outro";
import type { WrappedData } from "@/lib/types/wrapped";

const TOTAL_SLIDES = 10;
const AUTO_ADVANCE_MS = 5000;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

interface WrappedStoriesProps {
  data: WrappedData;
  groupId: string;
  year: number;
}

export function WrappedStories({ data, groupId, year }: WrappedStoriesProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduce = useReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((index: number, dir: number) => {
    setDirection(dir);
    setCurrentSlide(Math.max(0, Math.min(TOTAL_SLIDES - 1, index)));
  }, []);

  const goNext = useCallback(() => {
    if (currentSlide < TOTAL_SLIDES - 1) goTo(currentSlide + 1, 1);
  }, [currentSlide, goTo]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) goTo(currentSlide - 1, -1);
  }, [currentSlide, goTo]);

  useEffect(() => {
    if (isPaused || shouldReduce || currentSlide === TOTAL_SLIDES - 1) return;
    const timer = setTimeout(goNext, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [currentSlide, isPaused, shouldReduce, goNext]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goNext, goPrev]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev();
    }
    touchStartX.current = null;
  }

  function handleTap(e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    if (pct < 0.25) goPrev();
    else if (pct > 0.75) goNext();
    else setIsPaused((p) => !p);
  }

  const slides = [
    <SlideIntro key="intro" data={data} />,
    <SlideBookPages key="books" data={data} />,
    <SlideTopRated key="top-rated" data={data} />,
    <SlideReadingHours key="hours" data={data} />,
    <SlideMostActive key="most-active" data={data} />,
    <SlideFunniestQuote key="quote" data={data} />,
    <SlideGenreBreakdown key="genre" data={data} />,
    <SlideEmotionalStats key="emotional" data={data} />,
    <SlideSuperlatives key="superlatives" data={data} />,
    <SlideOutro key="outro" data={data} groupId={groupId} year={year} />,
  ];

  const transition = shouldReduce
    ? { duration: 0 }
    : { duration: 0.3, ease: [0.4, 0, 0.2, 1] as const };

  // Force light-mode CSS variables so slides always render with dark text on
  // the warm-cream background — regardless of the user's theme preference.
  const lightVars = {
    "--foreground": "oklch(0.20 0.015 80)",
    "--muted-foreground": "oklch(0.48 0.025 80)",
    "--muted": "oklch(0.94 0.012 78)",
    "--primary": "oklch(0.52 0.08 152)",
    "--primary-foreground": "oklch(0.99 0.005 152)",
    "--border": "oklch(0.89 0.02 76)",
    "--background": "oklch(0.96 0.015 78)",
  } as React.CSSProperties;

  return (
    <div
      className="fixed inset-0 z-50 bg-background overflow-hidden select-none"
      style={lightVars}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      <WrappedBackground />

      <div className="absolute top-4 left-0 right-0 flex justify-center z-20">
        <WrappedDots
          total={TOTAL_SLIDES}
          current={currentSlide}
          onDotClick={(i) => goTo(i, i > currentSlide ? 1 : -1)}
        />
      </div>

      <div ref={slideRef} className="absolute inset-0 flex items-center justify-center">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentSlide}
            className="absolute inset-0 flex items-center justify-center p-6"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={transition}
          >
            {slides[currentSlide]}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="absolute bottom-6 right-6 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <WrappedShareButton slideRef={slideRef} slideNumber={currentSlide + 1} year={year} />
      </div>
    </div>
  );
}
