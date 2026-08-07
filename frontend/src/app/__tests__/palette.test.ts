import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, readChroma, readToken, toBytes } from "@/test-utils/color";

/**
 * A rampa neutra subiu de croma (#288). Dois riscos vieram junto:
 *
 * 1. Mexer em croma mexe em luminância, e portanto em contraste de texto.
 * 2. O bloco `em-emoji-picker` duplica tokens como triplets RGB — o Web
 *    Component não aceita `var()`. Os oito estavam errados e ninguém notou
 *    porque nada os comparava com a origem.
 */

const CSS = readFileSync(
  path.resolve(__dirname, "../globals.css"),
  "utf8",
);

const THEMES = [
  { name: "light", selector: ":root" },
  { name: "dark", selector: ".dark" },
] as const;

/** WCAG AA para texto normal. */
const AA = 4.5;

describe("contraste de texto", () => {
  const PARES = [
    ["foreground", "background"],
    ["card-foreground", "card"],
    ["popover-foreground", "popover"],
    ["muted-foreground", "background"],
    ["muted-foreground", "card"],
    ["accent-foreground", "accent"],
    ["secondary-foreground", "secondary"],
  ] as const;

  describe.each(THEMES)("no tema $name", ({ selector }) => {
    it.each(PARES)("--%s sobre --%s passa em AA", (fg, bg) => {
      const ratio = contrast(
        readToken(CSS, selector, fg).rgb,
        readToken(CSS, selector, bg).rgb,
      );
      expect(ratio).toBeGreaterThanOrEqual(AA);
    });
  });
});

describe("rampa neutra", () => {
  /**
   * O croma que motivou o #275: 0.010 no dark é cinza. O piso aqui é o
   * mínimo abaixo do qual "papel quente" deixa de ser perceptível.
   */
  const PISO = 0.018;

  const SUPERFICIES = [
    "background",
    "card",
    "popover",
    "secondary",
    "muted",
    "accent",
  ] as const;

  describe.each(THEMES)("no tema $name", ({ selector }) => {
    it.each(SUPERFICIES)("--%s tem croma acima do piso", (token) => {
      expect(readChroma(CSS, selector, token)).toBeGreaterThanOrEqual(PISO);
    });

    it.each(["foreground", "muted-foreground"] as const)(
      "--%s fica abaixo do teto de croma de texto",
      (token) => {
        // Superfície carrega o calor; texto sobe menos da metade do caminho.
        // Acima de ~0.04 o corpo de texto começa a ler como filtro sépia e
        // cansa em leitura longa — que é o uso principal deste app.
        expect(readChroma(CSS, selector, token)).toBeLessThan(0.04);
      },
    );
  });

  it("no light o card não é mais frio que o fundo", () => {
    // Levar só o --background, como o #275 dizia, deixaria a superfície
    // elevada lendo mais cinza que a página atrás dela.
    const card = readChroma(CSS, ":root", "card");
    const background = readChroma(CSS, ":root", "background");
    expect(card / background).toBeGreaterThan(0.6);
  });
});

describe("em-emoji-picker", () => {
  /**
   * O Web Component lê triplets, não `var()`. Cada um vem de um token, e o
   * comentário ao lado diz qual — este teste é o que faz o comentário valer.
   */
  const DERIVADOS = [
    { seletor: ":root", picker: "em-emoji-picker", varName: "rgb-background", token: "popover" },
    { seletor: ":root", picker: "em-emoji-picker", varName: "rgb-color", token: "foreground" },
    { seletor: ":root", picker: "em-emoji-picker", varName: "rgb-accent", token: "primary" },
    { seletor: ":root", picker: "em-emoji-picker", varName: "rgb-input", token: "input" },
    { seletor: ".dark", picker: ".dark em-emoji-picker", varName: "rgb-background", token: "popover" },
    { seletor: ".dark", picker: ".dark em-emoji-picker", varName: "rgb-color", token: "foreground" },
    { seletor: ".dark", picker: ".dark em-emoji-picker", varName: "rgb-accent", token: "primary" },
    { seletor: ".dark", picker: ".dark em-emoji-picker", varName: "rgb-input", token: "muted" },
  ];

  function tripletDoPicker(picker: string, varName: string): number[] {
    const open = CSS.indexOf(`${picker} {`);
    if (open === -1) throw new Error(`bloco ${picker} não encontrado`);
    const block = CSS.slice(open, CSS.indexOf("\n}", open));
    const prefix = `--${varName}:`;
    const linha = block
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith(prefix));
    if (!linha) throw new Error(`--${varName} não existe em ${picker}`);
    return linha
      .slice(prefix.length)
      .replace(";", "")
      .split(",")
      .map((n) => Number(n.trim()));
  }

  it.each(DERIVADOS)(
    "$picker --$varName bate com --$token",
    ({ seletor, picker, varName, token }) => {
      expect(tripletDoPicker(picker, varName)).toEqual(
        toBytes(readToken(CSS, seletor, token).rgb),
      );
    },
  );
});
