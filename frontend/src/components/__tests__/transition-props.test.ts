import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `transition-all` faz o browser observar toda propriedade animável — inclusive
 * as que disparam layout e paint — em vez das que a interação realmente muda
 * (#270). Depois de nomear as dez ocorrências que existiam, este teste é o que
 * impede a próxima de entrar sem querer: `transition-all` é o default cômodo,
 * e ninguém repara num diff.
 *
 * Se alguma tela precisar mesmo dele, o caminho é justificar aqui — não
 * silenciar o teste.
 */

const SRC = path.resolve(__dirname, "../..");

function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("transições nomeadas", () => {
  it("nenhum componente usa transition-all", () => {
    const culpados = sourceFiles().filter((file) =>
      /\btransition-all\b/.test(readFileSync(file, "utf8")),
    );

    expect(culpados.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});
