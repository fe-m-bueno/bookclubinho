import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * O travessão não sobrevive ao copy.
 *
 * Ele entrou em frase de tela, em rótulo de leitor de tela e em título de aba,
 * sempre no mesmo papel: emendar duas orações que ficariam melhores como duas
 * frases, ou como uma frase com vírgula. É a marca mais reconhecível de texto
 * escrito por máquina, e num app em português ele ainda se confunde com o
 * hífen para quem lê rápido.
 *
 * A varredura é pela AST do TypeScript, e não por regex sobre o arquivo: só
 * assim comentário fica de fora sem eu ter que reimplementar um lexer. Dentro
 * de comentário o travessão segue liberado, porque comentário não é copy.
 */

const SRC = path.resolve(__dirname, "..");

const DASH = /[—–]/;

function arquivosDeCodigo(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "test-utils") continue;
      out.push(...arquivosDeCodigo(full));
      continue;
    }
    if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Todo pedaço de texto literal do arquivo, com a linha de onde saiu. */
function textosLiterais(
  file: string,
): Array<{ texto: string; linha: number }> {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const out: Array<{ texto: string; linha: number }> = [];

  function visit(node: ts.Node) {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push({
        texto: node.text,
        linha:
          source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return out;
}

describe("copy da interface", () => {
  const arquivos = arquivosDeCodigo(SRC);

  it("varre o código todo", () => {
    // Se a varredura quebrar e não achar arquivo nenhum, o teste passaria
    // vazio e ninguém saberia. O número só precisa ser grande o bastante para
    // provar que a busca aconteceu.
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("não usa travessão em texto de tela", () => {
    const achados: string[] = [];

    for (const file of arquivos) {
      for (const { texto, linha } of textosLiterais(file)) {
        if (!DASH.test(texto)) continue;
        // O único travessão que fica: a célula sem valor. Ele não é frase, é
        // sinal de "nada aqui", e trocá-lo por hífen desalinharia a coluna.
        if (texto.trim() === "—" || texto.trim() === "–") continue;
        achados.push(
          `${path.relative(SRC, file)}:${linha}  ${texto.trim().slice(0, 80)}`,
        );
      }
    }

    expect(achados).toEqual([]);
  });
});
