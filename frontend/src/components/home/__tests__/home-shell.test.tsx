import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeSkeleton } from "../home-skeleton";
import { HomeColumns, HomeMain, HomeShell } from "../home-shell";

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
    expect(main.className).toContain("lg:max-w-6xl");
    expect(main.className).toContain("px-6");
    // `flex-1` é o que faz o main empurrar o rodapé numa página curta.
    expect(main.className).toContain("flex-1");
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
    // A coluna de ação não estica — 42rem é a largura em que os cards foram
    // desenhados. Com `1fr` o card ia a ~900px e o rodapé dele boiava.
    expect(root.className).toContain("lg:grid-cols-[minmax(0,42rem)_320px]");
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
