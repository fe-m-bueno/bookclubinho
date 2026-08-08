import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeSkeleton } from "../home-skeleton";
import {
  HomeColumns,
  HomeHeader,
  HomeMain,
  HomeShell,
} from "../home-shell";

/**
 * O skeleton da home saltava ao carregar: sem `min-h-screen` ele era mais curto
 * que a página real, e sem `pb-24` não reservava a faixa do FAB.
 *
 * O teste não compara strings de classe entre dois arquivos — isso só troca a
 * divergência por um teste que precisa ser atualizado junto. Ele verifica que o
 * skeleton usa o *mesmo componente* de container que o conteúdo, que é o que
 * torna a divergência impossível.
 */

function rootOf(ui: React.ReactElement): HTMLElement {
  const { container } = render(ui);
  return container.firstElementChild as HTMLElement;
}

describe("container compartilhado da home", () => {
  it("reserva altura de tela inteira e a faixa do FAB", () => {
    const shell = rootOf(<HomeShell>conteúdo</HomeShell>);

    // Sem estes dois a página muda de altura quando o dado chega, e o FAB
    // cobre o último card — os dois sintomas que motivaram a issue.
    expect(shell.className).toContain("min-h-screen");
    expect(shell.className).toContain("pb-24");
  });

  it("dá ao main a mesma largura e padding nos dois estados", () => {
    const main = rootOf(<HomeMain>conteúdo</HomeMain>);

    expect(main.tagName).toBe("MAIN");
    // Mobile e tablet seguem em 672px; só a tela larga abre, e só porque agora
    // existe um trilho para ocupar o espaço em vez de esticar o card.
    expect(main.className).toContain("max-w-2xl");
    expect(main.className).toContain("lg:max-w-[67rem]");
    expect(main.className).toContain("px-6");
    // `flex-1` é o que faz o main empurrar o rodapé numa página curta.
    expect(main.className).toContain("flex-1");
  });

  /**
   * O header aplicava `px-6` um nível acima do `max-w-*`, e o main no mesmo
   * elemento: o header centralizava a página dentro de uma caixa já encolhida
   * pelo padding, o main centralizava na tela inteira e só então recuava. Dava
   * 24px de diferença — o cumprimento nascia à esquerda da borda dos cards e o
   * menu terminava à direita do trilho.
   */
  it("header e main recuam a partir da mesma borda", () => {
    const header = rootOf(<HomeHeader>conteúdo</HomeHeader>);
    const main = rootOf(<HomeMain>conteúdo</HomeMain>);

    for (const classe of ["mx-auto", "max-w-2xl", "lg:max-w-[67rem]", "px-6"]) {
      expect(header.className).toContain(classe);
      expect(main.className).toContain(classe);
    }
  });

  it("o skeleton renderiza dentro do mesmo shell do conteúdo", () => {
    const skeleton = rootOf(<HomeSkeleton />);
    const shell = rootOf(<HomeShell>conteúdo</HomeShell>);

    expect(skeleton.className).toBe(shell.className);
  });

  it("o main do skeleton bate com o main do conteúdo", () => {
    const { container } = render(<HomeSkeleton />);
    const skeletonMain = container.querySelector("main");
    const contentMain = rootOf(<HomeMain>conteúdo</HomeMain>);

    expect(skeletonMain).not.toBeNull();
    expect(skeletonMain!.className).toBe(contentMain.className);
  });
});

/**
 * Centro é ação, trilho é estado. Em uma coluna só um empurra o outro para
 * fora da dobra — era o que as conquistas faziam com os cards de clube.
 */
describe("HomeColumns", () => {
  it("só vira grid no desktop", () => {
    const root = rootOf(<HomeColumns rail={<span>trilho</span>}>ação</HomeColumns>);

    // Antes de `lg:` não há grid nenhum: o trilho volta a ser o rodapé da
    // coluna única, sem `order-*` invertendo DOM e tela.
    expect(root.className).not.toMatch(/(^|\s)grid(\s|$)/);
    expect(root.className).toContain("lg:grid");
    // A coluna de ação não estica até a tela toda — com `1fr` o card ia a
    // ~900px e o rodapé dele boiava —, mas 46rem é o que faz o rodapé do card
    // caber em uma linha só.
    expect(root.className).toContain("lg:grid-cols-[minmax(0,46rem)_19rem]");
  });

  /**
   * O desalinhamento que fazia a home parecer frouxa sem ter um espaço vazio
   * nomeável: o header media `max-w-6xl` (72rem) enquanto o grid media 64rem e
   * ainda se centralizava, então o cumprimento ficava 64px à esquerda da borda
   * dos cards e o menu 64px à direita do trilho.
   *
   * Ninguém percebe isso relendo duas classes em arquivos diferentes — por isso
   * o teste faz a conta.
   */
  it("a largura da página é exatamente a soma das colunas", () => {
    const main = rootOf(<HomeMain>conteúdo</HomeMain>);
    const colunas = rootOf(<HomeColumns rail={<span />}>ação</HomeColumns>);

    const pagina = main.className.match(/lg:max-w-\[([\d.]+)rem\]/);
    const grid = colunas.className.match(
      /lg:grid-cols-\[minmax\(0,([\d.]+)rem\)_([\d.]+)rem\]/,
    );
    const gap = colunas.className.match(/lg:gap-(\d+)/);

    expect(pagina).not.toBeNull();
    expect(grid).not.toBeNull();
    expect(gap).not.toBeNull();

    // A escala do Tailwind é 0.25rem por passo: `gap-8` são 2rem.
    const gapEmRem = Number(gap![1]) * 0.25;
    expect(Number(grid![1]) + Number(grid![2]) + gapEmRem).toBe(
      Number(pagina![1]),
    );
  });

  it("o grid não se centraliza dentro do container", () => {
    const colunas = rootOf(<HomeColumns rail={<span />}>ação</HomeColumns>);

    // Centralizar reintroduziria a folga que o alinhamento acima elimina: as
    // colunas passariam a flutuar dentro de um container mais largo que elas.
    expect(colunas.className).not.toContain("justify-center");
  });

  it("o trilho vem depois da ação na ordem de leitura", () => {
    render(<HomeColumns rail={<span>trilho</span>}>ação</HomeColumns>);

    const posicao = screen
      .getByText("ação")
      .compareDocumentPosition(screen.getByText("trilho"));
    expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sem trilho, não sobra um aside vazio", () => {
    const { container } = render(<HomeColumns>ação</HomeColumns>);

    expect(container.querySelector("aside")).toBeNull();
  });

  it("o skeleton usa as mesmas colunas do conteúdo", () => {
    // Sem isto o skeleton ocuparia a largura toda do `max-w-6xl` no desktop e
    // os cards encolheriam de ~1150px para 672px quando o dado chegasse — o
    // mesmo salto que o container compartilhado existe para impedir.
    const { container } = render(<HomeSkeleton />);
    const colunas = rootOf(<HomeColumns rail={<span />}>ação</HomeColumns>);

    const noSkeleton = container.querySelector("main > div");
    expect(noSkeleton?.className).toBe(colunas.className);
  });
});
