import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSkeletonState } from "../use-skeleton-state";

describe("useSkeletonState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("começa com showSkeleton=false quando isLoading=false", () => {
    const { result } = renderHook(() => useSkeletonState(false));
    expect(result.current.showSkeleton).toBe(false);
  });

  it("não exibe skeleton em load rápido (< 250ms)", () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(200));
    expect(result.current.showSkeleton).toBe(false);

    rerender({ isLoading: false });
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.showSkeleton).toBe(false);
  });

  it("exibe skeleton em load lento (> 250ms)", () => {
    const { result } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(250));
    expect(result.current.showSkeleton).toBe(true);
  });

  it("esconde skeleton imediatamente se loading acabou com > 500ms de exibição", () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(250)); // skeleton aparece
    act(() => vi.advanceTimersByTime(500)); // fica 500ms visível

    rerender({ isLoading: false });

    expect(result.current.showSkeleton).toBe(false);
  });

  it("mantém skeleton pelo tempo mínimo de 500ms se loading acabou cedo", () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(250)); // skeleton aparece
    expect(result.current.showSkeleton).toBe(true);

    rerender({ isLoading: false }); // loading acabou, mas skeleton só tem 0ms de exibição

    act(() => vi.advanceTimersByTime(400)); // 400ms de hold — ainda não chegou nos 500ms
    expect(result.current.showSkeleton).toBe(true);

    act(() => vi.advanceTimersByTime(100)); // agora completou 500ms
    expect(result.current.showSkeleton).toBe(false);
  });

  it("não exibe skeleton em toggles rápidos (sem flicker)", () => {
    const { result, rerender } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(100));
    rerender({ isLoading: false });
    act(() => vi.advanceTimersByTime(50));
    rerender({ isLoading: true });
    act(() => vi.advanceTimersByTime(100));
    rerender({ isLoading: false });
    act(() => vi.advanceTimersByTime(500));

    expect(result.current.showSkeleton).toBe(false);
  });

  it("exibe skeleton quando isLoading começa como true no mount", () => {
    const { result } = renderHook(() => useSkeletonState(true));

    act(() => vi.advanceTimersByTime(250));
    expect(result.current.showSkeleton).toBe(true);
  });

  it("não atualiza estado após unmount durante delay", () => {
    const { unmount } = renderHook(() => useSkeletonState(true));

    act(() => vi.advanceTimersByTime(100));
    unmount();

    // timers devem ser cancelados — avançar tempo sem erros
    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
  });

  it("não atualiza estado após unmount durante hold", () => {
    const { result, rerender, unmount } = renderHook(
      ({ isLoading }) => useSkeletonState(isLoading),
      { initialProps: { isLoading: true } },
    );

    act(() => vi.advanceTimersByTime(250)); // skeleton aparece
    expect(result.current.showSkeleton).toBe(true);

    rerender({ isLoading: false }); // entra em hold
    act(() => vi.advanceTimersByTime(200)); // ainda dentro do hold

    unmount(); // desmonta durante hold

    expect(() => act(() => vi.advanceTimersByTime(500))).not.toThrow();
  });
});
