import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTourCompleted, STORAGE_KEY, _resetCache } from "../use-tour-completed";

describe("useTourCompleted", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetCache();
    vi.restoreAllMocks();
  });

  it("returns false when localStorage is empty", () => {
    const { result } = renderHook(() => useTourCompleted());
    expect(result.current.completed).toBe(false);
  });

  it("returns true when flag exists in localStorage", () => {
    localStorage.setItem(STORAGE_KEY, "true");
    const { result } = renderHook(() => useTourCompleted());
    expect(result.current.completed).toBe(true);
  });

  it("markCompleted sets the flag in localStorage", () => {
    const { result } = renderHook(() => useTourCompleted());
    expect(result.current.completed).toBe(false);

    act(() => result.current.markCompleted());

    expect(result.current.completed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});
