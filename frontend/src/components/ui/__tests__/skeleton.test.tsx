import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../skeleton";
import { composite, contrast, readToken } from "@/test-utils/color";

/**
 * O skeleton some contra o fundo, e o diagnóstico original (#275) creditava
 * isso a um único número de contraste. São três causas, e duas só aparecem
 * quando se mede o token contra as *duas* superfícies em que ele renderiza:
 *
 * 1. `--card` e `--background` têm lightness diferentes, e `--accent` fica de
 *    lados opostos delas em light e dark. Nenhuma cor opaca serve às duas.
 * 2. `animate-pulse` oscila a opacidade até 0.5, então metade do ciclo vive
 *    perto de 1.04:1 — é aí que ele de fato desaparece.
 * 3. `--accent` é o token de hover; skeletons emprestando-o mudam junto.
 *
 * O teste lê o CSS em vez de duplicar os valores porque o alvo é justamente
 * impedir que um ajuste de paleta derrube o contraste sem ninguém notar.
 */

const CSS = readFileSync(
  path.resolve(__dirname, "../../../app/globals.css"),
  "utf8",
);

/** Faixa alvo, do #275: visível sem competir com o conteúdo real. */
const MIN_CONTRAST = 1.13;
const MAX_CONTRAST = 1.3;

/** O piso de opacidade do pulse — o vale do ciclo. */
const PULSE_FLOOR = 0.7;

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const;

const SURFACES = ["card", "background"] as const;

describe("token --skeleton", () => {
  it.each(THEMES)("existe no tema $name", ({ selector }) => {
    expect(() => readToken(CSS, selector, "skeleton")).not.toThrow();
  });

  it.each(THEMES)(
    "é translúcido no tema $name, para valer nas duas superfícies",
    ({ selector }) => {
      // Cor opaca não consegue contraste equivalente sobre --card e sobre
      // --background ao mesmo tempo: as duas têm lightness diferentes, e em
      // light e dark o token precisaria ficar de lados opostos delas.
      expect(readToken(CSS, selector, "skeleton").alpha).toBeLessThan(1);
    },
  );

  describe.each(THEMES)("contraste no tema $name", ({ selector }) => {
    it.each(SURFACES)("fica na faixa alvo sobre --%s", (surface) => {
      const skeleton = readToken(CSS, selector, "skeleton");
      const bg = readToken(CSS, selector, surface).rgb;

      const peak = contrast(composite(skeleton.rgb, bg, skeleton.alpha), bg);
      const trough = contrast(
        composite(skeleton.rgb, bg, skeleton.alpha * PULSE_FLOOR),
        bg,
      );

      // O vale é o que importa: com `animate-pulse` (piso 0.5) ele caía para
      // ~1.04 e o skeleton sumia metade do ciclo.
      expect(trough).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(peak).toBeLessThanOrEqual(MAX_CONTRAST);
    });
  });
});

describe("<Skeleton />", () => {
  it("usa o token próprio e não o de hover", () => {
    render(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");

    expect(el.className).toContain("bg-skeleton");
    // `--accent` é o token de hover (`hover:bg-accent/30` nos cards). Emprestá-lo
    // faz um ajuste de hover mexer em skeleton sem ninguém perceber.
    expect(el.className).not.toContain("bg-accent");
  });

  it("anima com o pulse próprio, que tem piso mais alto que o do Tailwind", () => {
    render(<Skeleton data-testid="s" />);
    const el = screen.getByTestId("s");

    expect(el.className).toContain("animate-skeleton-pulse");
    expect(el.className).not.toContain("animate-pulse");
  });

  it("aceita className sem perder o token", () => {
    render(<Skeleton className="h-4 w-24" data-testid="s" />);
    const el = screen.getByTestId("s");

    expect(el.className).toContain("bg-skeleton");
    expect(el.className).toContain("h-4");
  });
});
