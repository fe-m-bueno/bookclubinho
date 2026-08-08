import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A mãozinha do mouse vive em uma regra só.
 *
 * O preflight do Tailwind v4 dá `cursor: default` a todo `<button>`, então no
 * desktop nada distinguia um botão de um parágrafo: o menu do usuário, o FAB,
 * o enviar do chat, as abas de conquistas e os gatilhos de select ficavam sem
 * pista nenhuma. A correção é uma regra de base, e não `cursor-pointer`
 * espalhado por componente, porque o próximo `<button>` cru já nasce coberto.
 *
 * jsdom não aplica o CSS do app, então quem responde por essa regra é o texto
 * do `globals.css`. É o mesmo caminho do teste de paleta.
 */

const CSS = readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");

/** O seletor da regra que declara `cursor: pointer`. */
const SELETOR = (() => {
  const decl = CSS.indexOf("cursor: pointer;");
  if (decl === -1) throw new Error("nenhuma regra declara cursor: pointer");
  const abre = CSS.lastIndexOf("{", decl);
  const fim = CSS.lastIndexOf("}", abre);
  return CSS.slice(fim + 1, abre);
})();

describe("cursor de elemento clicável", () => {
  it.each([
    ["button:not(:disabled)", "botão cru, que o preflight zera"],
    ["select:not(:disabled)", "select nativo"],
    ['[role="button"]', "div que o Radix promove a botão"],
    ['[role="tab"]', "aba"],
    ['[role="menuitem"]', "item de menu"],
    ['[role="option"]', "opção de select"],
    ['[role="switch"]', "chave de liga/desliga"],
    ['[role="checkbox"]', "caixa de seleção"],
    ['[role="radio"]', "botão de rádio"],
    ["label[for]", "rótulo que foca o campo ao ser clicado"],
    ["summary", "resumo de details"],
  ])("cobre %s (%s)", (seletor) => {
    expect(SELETOR).toContain(seletor);
  });

  it("não vale para o que está desabilitado", () => {
    // Um botão desabilitado com mãozinha promete um clique que não acontece.
    expect(SELETOR).toContain(":not(:disabled)");
    expect(SELETOR).toContain(':not([aria-disabled="true"])');
  });

  it("deixa combobox de fora", () => {
    // `<input role="combobox">` continua sendo campo de digitação e precisa do
    // cursor de texto. O gatilho de select do Radix já entra por ser `button`.
    expect(SELETOR).not.toContain('[role="combobox"]');
  });
});
