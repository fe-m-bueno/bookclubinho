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
      "var(--font-fraunces)",
    );
    for (const nome of ["type-body", "type-meta", "type-micro"]) {
      expect(decl(utility(nome), "font-family")).toBe("var(--font-rubik)");
    }
  });

  it("aponta para a variável do next/font, não para o apelido do tema", () => {
    /**
     * `--font-display` e `--font-sans` vivem em `@theme inline`, e `inline`
     * quer dizer que o Tailwind troca a chave pelo valor dentro dos
     * utilitários que ele gera, em vez de emitir a variável no `:root`. Em CSS
     * escrito à mão elas não existem, e a família cai calada no sans do
     * sistema: o nome do clube na home perdeu o Fraunces exatamente assim, e
     * só apareceu porque a tela foi olhada.
     */
    for (const nome of ["type-title", "type-body", "type-meta", "type-micro"]) {
      const familia = decl(utility(nome), "font-family") ?? "";
      expect(familia).not.toContain("--font-display");
      expect(familia).not.toContain("--font-sans");
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
  "components/home",
  "app/auth",
  "app/onboarding",
];

/**
 * O que continua em `text-sm` porque não é papel de texto, e sim medida de
 * controle: enquanto os primitivos de `ui/` não entrarem na rampa, alinhar
 * estes dois à escala os deixaria 1px fora dos vizinhos, que é exatamente o
 * defeito que a rampa existe para tirar.
 */
const EXCECOES = new Map([
  [
    "components/home/user-menu.tsx",
    'a linha "Modo escuro" acompanha os botões ghost em volta, que vêm do primitivo Button, e as iniciais do avatar são medida de desenho, não papel de texto',
  ],
]);

describe("densidade", () => {
  const SRC = path.resolve(__dirname, "../..");

  function paddings(rel: string): string[] {
    const fonte = readFileSync(path.join(SRC, rel), "utf8");
    return [...new Set(fonte.match(/\b(?:p|px|py)-[0-9.]+/g) ?? [])].sort();
  }

  /**
   * Um padding de card e um de card compacto, e mais nenhum.
   *
   * Conviviam p-5, p-4, p-3 e p-6 no mesmo app, e é dessa mistura que sai o
   * salto entre um componente e o skeleton dele: os dois escolhiam o padding
   * separado, sem nada obrigando a escolher igual. `px-4` continua valendo
   * dentro de controle — botão tem largura própria e não é superfície.
   */
  const PERMITIDOS = new Set(["p-5", "p-3", "px-5", "py-3", "px-4"]);

  const MIGRADOS = [
    "components/home/group-home-card.tsx",
    "components/home/home-skeleton.tsx",
    "components/home/home-state-rail.tsx",
    "components/home/upcoming-meeting-pill.tsx",
    "components/home/recent-badge-card.tsx",
  ];

  it.each(MIGRADOS)("%s usa só a escala de padding decidida", (rel) => {
    for (const p of paddings(rel)) expect(PERMITIDOS).toContain(p);
  });

  /**
   * O par componente/skeleton, que é onde a inconsistência aparece como
   * movimento na tela: se o card real usa p-5 e o skeleton p-4, a página se
   * reacomoda 8px no instante em que o dado chega.
   */
  const PARES = [
    {
      componente: "components/home/group-home-card.tsx",
      skeleton: "components/home/home-skeleton.tsx",
    },
  ];

  it.each(PARES)(
    "$skeleton reserva o mesmo padding de $componente",
    ({ componente, skeleton }) => {
      // Subconjunto, e não igualdade: o card real tem o `px-4` do botão de
      // ação, que o skeleton desenha como bloco sem texto dentro.
      for (const p of paddings(skeleton)) {
        expect(paddings(componente)).toContain(p);
      }
    },
  );
});

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
      const rel = path.relative(SRC, file);
      if (EXCECOES.has(rel)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((linha, i) => {
          if (/\btext-(xs|sm)\b/.test(linha)) achados.push(`${rel}:${i + 1}`);
        });
    }
    expect(achados).toEqual([]);
  });

  it("cada exceção aponta para um arquivo que existe", () => {
    // Exceção que sobrevive ao arquivo que a justificava vira permissão
    // silenciosa para o resto do diretório.
    for (const rel of EXCECOES.keys()) {
      expect(() => statSync(path.join(SRC, rel))).not.toThrow();
    }
  });
});
