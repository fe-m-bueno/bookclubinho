"use client";

import { useEffect, useRef, useState } from "react";

const DELAY_TO_SHOW = 250;
const MIN_DISPLAY_TIME = 500;

/**
 * Delays showing a skeleton until loading has lasted more than 250ms,
 * and keeps it visible for at least 500ms once shown.
 *
 * Prevents flashing skeletons for fast loads, and jarring jumps for
 * loads that complete just after the skeleton appears.
 */
export function useSkeletonState(isLoading: boolean) {
  const [showSkeleton, setShowSkeleton] = useState(false);

  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleSinceRef = useRef<number>(0);
  const showSkeletonRef = useRef(false);

  useEffect(() => {
    function clearTimers() {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
      }
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }

    clearTimers();

    if (isLoading) {
      delayTimerRef.current = setTimeout(() => {
        visibleSinceRef.current = Date.now();
        showSkeletonRef.current = true;
        setShowSkeleton(true);
      }, DELAY_TO_SHOW);
    } else {
      if (!showSkeletonRef.current) return;

      const elapsed = Date.now() - visibleSinceRef.current;
      if (elapsed >= MIN_DISPLAY_TIME) {
        showSkeletonRef.current = false;
        setShowSkeleton(false);
      } else {
        holdTimerRef.current = setTimeout(() => {
          showSkeletonRef.current = false;
          setShowSkeleton(false);
        }, MIN_DISPLAY_TIME - elapsed);
      }
    }

    return clearTimers;
  }, [isLoading]);

  return { showSkeleton };
}
