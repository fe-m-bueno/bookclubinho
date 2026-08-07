/**
 * Conversão oklch → sRGB e contraste, para testes que leem o `globals.css`.
 *
 * Existe como código versionado, e não como script solto, porque a paleta tem
 * dois lugares onde um valor precisa concordar com outro e nada avisa quando
 * param de concordar: o contraste do skeleton contra as superfícies, e os
 * triplets RGB do seletor de emoji, que não aceitam `var()`. Os oito triplets
 * ficaram errados por meses exatamente por falta disto.
 */

export type Rgb = [number, number, number];

export interface Color {
  rgb: Rgb;
  /** Alfa do token; 1 quando opaco. */
  alpha: number;
}

export function oklchToSrgb(L: number, C: number, H: number): Rgb {
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

/** Mesmo arredondamento que o rasterizador do browser aplica. */
export function toBytes([r, g, b]: Rgb): Rgb {
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(fg: Rgb, bg: Rgb): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Compõe `fg` sobre `bg` com alfa — o que o browser faz com cor translúcida. */
export function composite(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

/** Aceita `oklch(0.98 0.01 76)` e `oklch(1 0 0 / 8%)`. */
export function parseOklch(value: string): Color {
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
 * Lê um custom property de dentro de um bloco do CSS.
 *
 * Parse por índice, e não por RegExp montada com template string: o SAST
 * bloqueia regex dinâmica (ReDoS), e aqui ela nem seria necessária.
 */
export function readToken(css: string, selector: string, name: string): Color {
  const open = css.indexOf(`${selector} {`);
  if (open === -1) throw new Error(`bloco ${selector} não encontrado`);

  const close = css.indexOf("\n}", open);
  const block = css.slice(open, close === -1 ? undefined : close);

  return parseOklch(readDeclaration(block, name, selector));
}

/** O croma cru do token, sem passar por sRGB — para asserções sobre a rampa. */
export function readChroma(
  css: string,
  selector: string,
  name: string,
): number {
  const open = css.indexOf(`${selector} {`);
  if (open === -1) throw new Error(`bloco ${selector} não encontrado`);
  const block = css.slice(open, css.indexOf("\n}", open));
  const value = readDeclaration(block, name, selector);
  const match = value.match(/oklch\([\d.]+\s+([\d.]+)/);
  if (!match) throw new Error(`--${name} não é oklch de croma: ${value}`);
  return Number(match[1]);
}

function readDeclaration(
  block: string,
  name: string,
  selector: string,
): string {
  const prefix = `--${name}:`;
  const line = block
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(prefix));
  if (!line) throw new Error(`--${name} não existe em ${selector}`);
  return line.slice(prefix.length).replace(";", "").trim();
}
