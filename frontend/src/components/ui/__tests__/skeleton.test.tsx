import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "../skeleton";

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
 * impedir que um ajuste de paleta derrube o contraste sem ninguém notar — e o
 * croma dos dois temas ainda vai subir (#275, item 2).
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

type Rgb = [number, number, number];

function oklchToSrgb(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return linear.map((x) => {
    const c = Math.min(1, Math.max(0, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Compõe `fg` sobre `bg` com alfa — o que o browser faz com cor translúcida. */
function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

interface Color {
  rgb: Rgb;
  /** Alfa do token, 1 quando opaco. */
  alpha: number;
}

/** `oklch(0.98 0.01 76)` e `oklch(1 0 0 / 8%)`. */
function parseOklch(value: string): Color {
  const match = value.match(
    /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)%\s*)?\)/,
  );
  if (!match) throw new Error(`oklch não reconhecido: ${value}`);
  const [, l, c, h, a] = match;
  return {
    rgb: oklchToSrgb(Number(l), Number(c), Number(h)),
    alpha: a === undefined ? 1 : Number(a) / 100,
  };
}

/**
 * Lê um custom property de dentro de um bloco do globals.css.
 *
 * Parse por índice, e não por RegExp montada com template string: o SAST
 * bloqueia regex dinâmica (ReDoS), e aqui ela nem seria necessária.
 */
function token(selector: string, name: string): Color {
  const open = CSS.indexOf(`${selector} {`);
  if (open === -1) throw new Error(`bloco ${selector} não encontrado`);

  const close = CSS.indexOf("\n}", open);
  const block = CSS.slice(open, close === -1 ? undefined : close);

  const prefix = `--${name}:`;
  const line = block
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`--${name} não existe em ${selector}`);

  return parseOklch(line.slice(prefix.length).replace(";", "").trim());
}

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const;

const SURFACES = ["card", "background"] as const;

describe("token --skeleton", () => {
  it.each(THEMES)("existe no tema $name", ({ selector }) => {
    expect(() => token(selector, "skeleton")).not.toThrow();
  });

  it.each(THEMES)(
    "é translúcido no tema $name, para valer nas duas superfícies",
    ({ selector }) => {
      // Cor opaca não consegue contraste equivalente sobre --card e sobre
      // --background ao mesmo tempo: as duas têm lightness diferentes, e em
      // light e dark o token precisaria ficar de lados opostos delas.
      expect(token(selector, "skeleton").alpha).toBeLessThan(1);
    },
  );

  describe.each(THEMES)("contraste no tema $name", ({ selector }) => {
    it.each(SURFACES)("fica na faixa alvo sobre --%s", (surface) => {
      const skeleton = token(selector, "skeleton");
      const bg = token(selector, surface).rgb;

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
