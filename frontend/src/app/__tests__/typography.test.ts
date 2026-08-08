import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A rampa de quatro papéis.
 *
 * O app tinha 21 tamanhos de texto e 68% de todo o texto em dois deles, 14px e
 * 12px. Dois pixels não separam informação, então o que sobrava para
 * distinguir era cor, e por isso um card lia como um bloco só. Os quatro
 * papéis existem para que a decisão seja "que papel é este texto" em vez de
 * "que tamanho parece bom aqui".
 *
 * jsdom não aplica o CSS do app: quem responde pelos valores é o texto do
 * `globals.css`, como no teste de paleta.
 */

const CSS = readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");

/** O corpo de um `@utility`, do `{` até a chave que o fecha. */
function utility(name: string): string {
  const abre = CSS.indexOf(`@utility ${name} {`);
  if (abre === -1) throw new Error(`@utility ${name} não existe`);
  let nivel = 0;
  for (let i = CSS.indexOf("{", abre); i < CSS.length; i++) {
    if (CSS[i] === "{") nivel++;
    if (CSS[i] === "}") {
      nivel--;
      if (nivel === 0) return CSS.slice(CSS.indexOf("{", abre) + 1, i);
    }
  }
  throw new Error(`@utility ${name} não fecha`);
}

function decl(body: string, prop: string): string | null {
  const linha = body
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${prop}:`));
  return linha ? linha.slice(prop.length + 1).replace(";", "").trim() : null;
}

describe("rampa tipográfica", () => {
  /** A tabela da decisão, em rem: 20 / 15 / 13 / 11 px. */
  const PAPEIS = [
    { nome: "type-title", size: "1.25rem", leading: "1.2", peso: "600" },
    { nome: "type-body", size: "0.9375rem", leading: "1.5", peso: "400" },
    { nome: "type-meta", size: "0.8125rem", leading: "1.4", peso: "500" },
    { nome: "type-micro", size: "0.6875rem", leading: "1.3", peso: "500" },
  ] as const;

  it.each(PAPEIS)("$nome fixa tamanho, entrelinha e peso", (papel) => {
    const body = utility(papel.nome);
    expect(decl(body, "font-size")).toBe(papel.size);
    expect(decl(body, "line-height")).toBe(papel.leading);
    expect(decl(body, "font-weight")).toBe(papel.peso);
  });

  it("cada degrau é um salto que se enxerga", () => {
    // O defeito medido era 14px ao lado de 12px. Menos de 1px de diferença
    // entre degraus vizinhos devolveria o problema.
    const px = PAPEIS.map((p) => parseFloat(p.size) * 16);
    for (let i = 1; i < px.length; i++) {
      expect(px[i - 1] - px[i]).toBeGreaterThanOrEqual(2);
    }
  });

  it("a cor vem do token, e por isso segue o tema", () => {
    // Cor literal aqui só valeria para um dos dois temas.
    expect(decl(utility("type-title"), "color")).toBe("var(--foreground)");
    expect(decl(utility("type-body"), "color")).toBe("var(--foreground)");
    expect(decl(utility("type-meta"), "color")).toBe("var(--muted-foreground)");
    expect(decl(utility("type-micro"), "color")).toContain(
      "var(--muted-foreground)",
    );
  });

  it("só o título usa Fraunces", () => {
    expect(decl(utility("type-title"), "font-family")).toBe(
      "var(--font-display)",
    );
    for (const nome of ["type-body", "type-meta", "type-micro"]) {
      expect(decl(utility(nome), "font-family")).toBe("var(--font-sans)");
    }
  });
});

describe("font-display", () => {
  it("deixa o corte da letra acompanhar o tamanho", () => {
    // `opsz` fixo em 32 aplicava corte de display em texto de 14px: traços
    // finos e espacejamento apertado no tamanho em que menos cabem.
    const body = utility("font-display");
    expect(decl(body, "font-variation-settings")).not.toContain("opsz");
    expect(decl(body, "font-optical-sizing")).toBe("auto");
  });

  it("mantém os eixos que não têm equivalente automático", () => {
    const settings = decl(utility("font-display"), "font-variation-settings");
    expect(settings).toContain("SOFT");
    expect(settings).toContain("WONK");
  });
});

/**
 * A migração é global mas entra por fatias, uma área por PR. Cada área
 * migrada entra nesta lista e passa a ser vigiada: sem isso, o `text-sm`
 * volta pela próxima tela que alguém escrever no diretório já migrado.
 */
const AREAS_MIGRADAS = [
  "components/auth",
  "components/onboarding",
  "app/auth",
  "app/onboarding",
];

describe("áreas já migradas", () => {
  function tsx(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        out.push(...tsx(full));
        continue;
      }
      if (entry.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  const SRC = path.resolve(__dirname, "../..");

  it.each(AREAS_MIGRADAS)("%s não usa text-xs nem text-sm soltos", (area) => {
    const achados: string[] = [];
    for (const file of tsx(path.join(SRC, area))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/\btext-(xs|sm)\b/.test(linha)) {
            achados.push(`${path.relative(SRC, file)}:${i + 1}`);
          }
        });
    }
    expect(achados).toEqual([]);
  });
});
