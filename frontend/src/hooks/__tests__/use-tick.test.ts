import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCountdown } from "@/hooks/use-countdown";
import { useTick } from "@/hooks/use-tick";

/**
 * O que se testa aqui é a economia que o `tick-store` prometia e que cinco
 * `setInterval` à mão desperdiçavam: um timer para todo mundo, e nenhum quando
 * ninguém está contando. `vi.getTimerCount()` mede exatamente isso.
 */
describe("useTick", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("avança de um em um segundo", () => {
    const { result, unmount } = renderHook(() => useTick());
    const start = result.current;

    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current - start).toBe(3);

    unmount();
  });

  it("três assinantes compartilham um intervalo só", () => {
    const a = renderHook(() => useTick());
    const b = renderHook(() => useTick());
    const c = renderHook(() => useTick());

    expect(vi.getTimerCount()).toBe(1);

    a.unmount();
    b.unmount();
    expect(vi.getTimerCount()).toBe(1);

    // Saiu o último: o intervalo global some junto.
    c.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("desabilitado não assina nada nem re-renderiza", () => {
    const { result, unmount } = renderHook(() => useTick(false));

    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);

    unmount();
  });
});

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sem prazo não conta nem mantém timer", () => {
    const { result, unmount } = renderHook(() => useCountdown(null));

    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    unmount();
  });

  it("devolve o que falta até o prazo, a cada segundo", () => {
    const deadline = Date.now() + 3_000;
    const { result, unmount } = renderHook(() => useCountdown(deadline));

    expect(result.current).toBe(3_000);

    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(2_000);

    unmount();
  });

  it("prazo cumprido zera e libera o intervalo", () => {
    // O prazo é calculado fora do render: recalcular a cada render seria um
    // countdown que nunca anda.
    const deadline = Date.now() + 2_000;
    const { result, unmount } = renderHook(() => useCountdown(deadline));

    expect(vi.getTimerCount()).toBe(1);

    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    unmount();
  });

  it("prazo já vencido nunca chega a assinar", () => {
    const deadline = Date.now() - 1_000;
    const { result, unmount } = renderHook(() => useCountdown(deadline));

    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    unmount();
  });
});
