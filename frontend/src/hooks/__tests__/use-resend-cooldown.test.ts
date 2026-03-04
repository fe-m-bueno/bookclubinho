import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useResendCooldown } from "../use-resend-cooldown";

describe("useResendCooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with remaining=0 and isActive=false", () => {
    const { result } = renderHook(() => useResendCooldown());
    expect(result.current.remaining).toBe(0);
    expect(result.current.isActive).toBe(false);
  });

  it("starts countdown and decrements", () => {
    const { result } = renderHook(() => useResendCooldown(5));

    act(() => result.current.start());
    expect(result.current.remaining).toBe(5);
    expect(result.current.isActive).toBe(true);

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(4);

    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.remaining).toBe(0);
    expect(result.current.isActive).toBe(false);
  });

  it("resets when start is called again", () => {
    const { result } = renderHook(() => useResendCooldown(3));

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.remaining).toBe(1);

    act(() => result.current.start());
    expect(result.current.remaining).toBe(3);
  });
});
