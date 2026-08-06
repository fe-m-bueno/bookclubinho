import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Todo `DialogContent` precisa de um `DialogDescription`.
 *
 * O Radix avisa em dev — "Missing `Description` or `aria-describedby={undefined}`
 * for {DialogContent}" — e o aviso não é decorativo: sem ele o leitor de tela
 * anuncia só o título, e num diálogo de confirmação o título raramente diz o
 * que está em jogo. Seis diálogos estavam assim, incluindo os dois passos da
 * exclusão de conta.
 *
 * O aviso do Radix aparece no console e passa batido. Este teste falha.
 *
 * Onde a descrição competiria com o conteúdo visual — o card da quote, por
 * exemplo — ela existe como `sr-only`: continua servindo quem usa leitor de
 * tela sem duplicar o que já está na tela.
 */
function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) tsxFiles(path, out);
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const FILES = tsxFiles("src");

/** Os componentes base declaram o `Content`; não são call sites. */
const BASE = new Set(["dialog.tsx", "alert-dialog.tsx"]);

function semDescricao(content: string, description: string): string[] {
  return FILES.filter((file) => {
    if (BASE.has(file.split("/").pop() ?? "")) return false;
    const src = readFileSync(file, "utf8");
    return src.includes(content) && !src.includes(description);
  });
}

describe("acessibilidade dos diálogos", () => {
  it("encontra os arquivos do app", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("todo DialogContent tem um DialogDescription", () => {
    expect(semDescricao("<DialogContent", "<DialogDescription")).toEqual([]);
  });

  it("todo AlertDialogContent tem um AlertDialogDescription", () => {
    expect(semDescricao("<AlertDialogContent", "<AlertDialogDescription")).toEqual([]);
  });
});
