import { describe, expect, it } from "vitest";

import { formatCountdown } from "@/lib/format-countdown";

/**
 * Trinta linhas dentro de um `useEffect` com `setInterval` não davam para
 * testar sem montar um componente e adiantar relógio. Como função pura, cada
 * faixa é uma linha.
 */
describe("formatCountdown", () => {
  it("acima de uma hora mostra horas e minutos", () => {
    expect(formatCountdown(2 * 3_600_000 + 5 * 60_000 + 30_000)).toBe("2h 5m");
  });

  it("abaixo de uma hora mostra minutos e segundos", () => {
    expect(formatCountdown(5 * 60_000 + 30_000)).toBe("5m 30s");
  });

  it("abaixo de um minuto mostra só segundos", () => {
    expect(formatCountdown(12_000)).toBe("12s");
  });

  it("trunca a fração de segundo em vez de arredondar para cima", () => {
    expect(formatCountdown(12_999)).toBe("12s");
  });

  it("na virada da hora os minutos zeram, não somem", () => {
    expect(formatCountdown(3_600_000)).toBe("1h 0m");
  });

  it("prazo vencido é zero, não texto negativo", () => {
    expect(formatCountdown(0)).toBe("0s");
    expect(formatCountdown(-5_000)).toBe("0s");
  });
});
