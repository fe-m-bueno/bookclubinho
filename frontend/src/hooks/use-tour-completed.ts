"use client";

import { useCallback, useSyncExternalStore } from "react";

export const STORAGE_KEY = "bookclub-tour-completed";

/** @internal Exported for test reset only */
export let cached: boolean | null = null;

export function _resetCache() {
  cached = null;
}

function subscribe(onStoreChange: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cached = localStorage.getItem(STORAGE_KEY) === "true";
      onStoreChange();
    }
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

function getSnapshot() {
  if (cached === null) {
    cached = localStorage.getItem(STORAGE_KEY) === "true";
  }
  return cached;
}

function getServerSnapshot() {
  return false;
}

export function useTourCompleted() {
  const completed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const markCompleted = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    cached = true;
    window.dispatchEvent(
      new StorageEvent("storage", { key: STORAGE_KEY, newValue: "true" })
    );
  }, []);

  return { completed, markCompleted };
}
