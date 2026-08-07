import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomeSkeleton } from "../home-skeleton";
import { HomeMain, HomeShell } from "../home-shell";

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
    expect(main.className).toContain("max-w-2xl");
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
