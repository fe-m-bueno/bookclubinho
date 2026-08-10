import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Emoji só onde o tom é festa (#322, item 8 do #275).
 *
 * O princípio é o do épico: **frequência alta = menos ornamento**. Emoji do
 * sistema não obedece token, muda de desenho entre plataformas, ignora o dark
 * mode e é lido em voz alta pelo leitor de tela — coisas que se toleram numa
 * tela a que a pessoa chega uma vez por ano, e que cansam no caminho diário.
 *
 * Depois de converter os oito arquivos de UI funcional, é este teste que impede
 * o próximo emoji de entrar: colar um caractere numa string é mais fácil do que
 * importar um ícone, e ninguém repara num diff.
 *
 * As superfícies liberadas abaixo não são exceções por descuido — cada uma tem
 * motivo. Ampliar a lista é decisão de design, e o lugar de justificar é aqui.
 */

const SRC = path.resolve(__dirname, "../..");

/**
 * Onde o emoji é o conteúdo, e não a decoração.
 *
 * - `wrapped/*` — a retrospectiva anual é a superfície de festa por definição.
 * - badges — o emoji vem da API (`badge.emoji`), e o `?? "🏅"` é o fallback
 *   dele. Trocar por lucide criaria duas linguagens no mesmo slot.
 * - `reaction-picker` — exceção explícita do #275: reagir *é* escolher emoji.
 * - `progress-update-modal` — o 🎉 marca terminar o livro, que acontece uma vez
 *   por rodada e é exatamente o momento de celebrar.
 */
const SUPERFICIES_DE_FESTA = [
  "components/wrapped/",
  "components/badges/badge-card.tsx",
  "components/badges/badge-detail-dialog.tsx",
  "components/home/recent-badge-card.tsx",
  "components/users/user-profile-client.tsx",
  "components/chat/reaction-picker.tsx",
  "components/rounds/progress-update-modal.tsx",
];

/**
 * Pictográficos e simbólicos do Unicode — as faixas de onde vem o emoji do
 * sistema.
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

/**
 * Glifos que caem na faixa `2600–27BF` sem serem emoji.
 *
 * `★` e os checks são tipografia: obedecem `color`, escalam com a `font-size` e
 * têm o mesmo desenho em toda plataforma — nada do que motiva esta regra se
 * aplica a eles. O `★` sobrevive de propósito em `rating-distribution-chart`
 * (rótulo de eixo, que o Recharts renderiza como string, onde componente não
 * entra) e em `stats-overview-cards` (sufixo de número).
 */
const TIPOGRAFICOS = /[★☆✓✔✗✘✦✧]/gu;

/**
 * Comentário não renderiza.
 *
 * Vários comentários deste PR citam o emoji que substituíram — "o 📚 que estava
 * aqui" é a explicação da mudança, e é exatamente o que se quer ler no
 * `git blame` daqui a um ano. Sem esta limpeza, documentar a conversão reprovaria
 * o teste que a conversão criou.
 *
 * O `//` só conta como comentário quando não vem depois de `:`, senão o teste
 * comeria o resto de qualquer linha com `https://`.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function pictogramas(fonte: string): boolean {
  return EMOJI.test(semComentarios(fonte).replace(TIPOGRAFICOS, ""));
}

function sourceFiles(dir: string = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function liberado(relativo: string): boolean {
  return SUPERFICIES_DE_FESTA.some((prefixo) => relativo.startsWith(prefixo));
}

describe("emoji só onde o tom é festa", () => {
  it("nenhuma tela de UI funcional tem emoji hardcoded", () => {
    const culpados = sourceFiles()
      .map((file) => path.relative(SRC, file))
      .filter((rel) => !liberado(rel))
      .filter((rel) => pictogramas(readFileSync(path.join(SRC, rel), "utf8")));

    expect(culpados).toEqual([]);
  });

  it("a lista de superfícies liberadas não tem entrada morta", () => {
    // Um caminho que deixou de existir é permissão que ninguém revoga. Se um
    // arquivo desta lista sair ou perder o emoji, a linha sai com ele.
    const comEmoji = new Set(
      sourceFiles()
        .map((file) => path.relative(SRC, file))
        .filter((rel) => pictogramas(readFileSync(path.join(SRC, rel), "utf8"))),
    );

    const orfaos = SUPERFICIES_DE_FESTA.filter(
      (prefixo) => ![...comEmoji].some((rel) => rel.startsWith(prefixo)),
    );

    expect(orfaos).toEqual([]);
  });
});
