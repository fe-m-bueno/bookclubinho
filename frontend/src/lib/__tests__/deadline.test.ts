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

  it("o atraso vira uma frase no passado", () => {
    expect(describeDeadline("2026-08-12", HOJE)).toMatchObject({
      label: "terminou ontem",
      tone: "overdue",
    });
    expect(describeDeadline("2026-08-10", HOJE)?.label).toBe(
      "terminou há 3 dias",
    );
  });

  /**
   * "termina amanhã" dizia quando sem dizer o quê. O botão ao lado não
   * resolvia: ele fica na outra ponta da faixa, some quando a rodada não
   * espera por você, e "Avaliar" não conta que o atraso é da avaliação.
   */
  describe("com a fase, a frase ganha sujeito", () => {
    it("nomeia o que termina", () => {
      expect(describeDeadline("2026-08-14", HOJE, "voting")?.label).toBe(
        "votação termina amanhã",
      );
      expect(describeDeadline("2026-08-13", HOJE, "nominating")?.label).toBe(
        "indicação termina hoje",
      );
      expect(describeDeadline("2026-08-20", HOJE, "reading")?.label).toBe(
        "leitura termina em 7 dias",
      );
    });

    it("nomeia o que atrasou", () => {
      expect(describeDeadline("2026-08-10", HOJE, "reviewing")?.label).toBe(
        "avaliação terminou há 3 dias",
      );
    });

    /** Sempre singular: assim o verbo é o mesmo nos quatro casos. */
    it("usa o mesmo verbo em todas as fases", () => {
      for (const fase of ["nominating", "voting", "reading", "reviewing"]) {
        expect(describeDeadline("2026-08-14", HOJE, fase)?.label).toContain(
          "termina amanhã",
        );
      }
    });

    it("fase desconhecida ou ausente cai na frase sem sujeito", () => {
      expect(describeDeadline("2026-08-14", HOJE, "finished")?.label).toBe(
        "termina amanhã",
      );
      expect(describeDeadline("2026-08-14", HOJE, null)?.label).toBe(
        "termina amanhã",
      );
    });
  });
});
