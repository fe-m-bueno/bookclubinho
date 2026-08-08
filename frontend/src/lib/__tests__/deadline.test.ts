import { describe, it, expect } from "vitest";
import { daysUntilDeadline, describeDeadline } from "../deadline";

/** 13/08/2026, meio-dia local — longe das bordas do dia de propósito. */
const HOJE = new Date(2026, 7, 13, 12, 0, 0);

describe("daysUntilDeadline", () => {
  it("conta o próprio dia como zero", () => {
    expect(daysUntilDeadline("2026-08-13", HOJE)).toBe(0);
  });

  it("conta amanhã como um, mesmo com hora avançada hoje", () => {
    // Às 23h de hoje ainda falta *um* dia para amanhã, não zero: a comparação
    // é entre dias do calendário, não entre instantes.
    const quaseMeiaNoite = new Date(2026, 7, 13, 23, 59, 0);
    expect(daysUntilDeadline("2026-08-14", quaseMeiaNoite)).toBe(1);
  });

  it("devolve negativo para prazo vencido", () => {
    expect(daysUntilDeadline("2026-08-10", HOJE)).toBe(-3);
  });

  it("lê a data no fuso local e não em UTC", () => {
    // `new Date("2026-08-13")` é meia-noite UTC, que a oeste de Greenwich cai
    // no dia 12 — a home diria que falta um dia a menos. O parse é manual por
    // isso; este teste é o que trava a regressão.
    const ingenuo = new Date("2026-08-13");
    expect(ingenuo.getDate()).not.toBe(13); // premissa do teste, em UTC-3
    expect(daysUntilDeadline("2026-08-13", HOJE)).toBe(0);
  });

  it("devolve null para string que não é data", () => {
    expect(daysUntilDeadline("qualquer coisa", HOJE)).toBeNull();
  });
});

describe("describeDeadline", () => {
  it("sem prazo, não há o que dizer", () => {
    expect(describeDeadline(null, HOJE)).toBeNull();
  });

  it("hoje e amanhã têm frase própria", () => {
    expect(describeDeadline("2026-08-13", HOJE)?.label).toBe("termina hoje");
    expect(describeDeadline("2026-08-14", HOJE)?.label).toBe("termina amanhã");
  });

  it("marca como urgente o que fecha em até três dias", () => {
    expect(describeDeadline("2026-08-16", HOJE)?.tone).toBe("urgent");
    expect(describeDeadline("2026-08-17", HOJE)?.tone).toBe("normal");
  });

  it("atraso é contado em dias, no singular quando é um", () => {
    expect(describeDeadline("2026-08-12", HOJE)).toMatchObject({
      label: "1 dia atrasado",
      tone: "overdue",
    });
    expect(describeDeadline("2026-08-10", HOJE)?.label).toBe("3 dias atrasado");
  });
});
