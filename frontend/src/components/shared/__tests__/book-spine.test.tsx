import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { BookSpine } from "../book-spine";

/**
 * O tratamento estava copiado em três telas com números soltos no JSX, e a
 * landing tinha inventado um quarto desenho de livro que não lia como livro.
 * Estes testes travam o contrato do componente compartilhado: perspectiva,
 * sombra e a faixa de lombada na borda esquerda.
 */
describe("BookSpine", () => {
  function spine(el: HTMLElement) {
    return el.firstElementChild as HTMLElement;
  }

  it("aplica a perspectiva rasa por padrão", () => {
    const { container } = render(<BookSpine className="h-20 w-14" />);
    const el = spine(container);

    expect(el.style.transform).toBe("perspective(400px) rotateY(-5deg)");
    expect(el.style.boxShadow).not.toBe("");
  });

  it("aprofunda a perspectiva no tamanho de estante", () => {
    const { container } = render(<BookSpine depth="lg" />);

    expect(spine(container).style.transform).toBe(
      "perspective(600px) rotateY(-8deg)",
    );
  });

  it("desenha a lombada na borda esquerda, e ela não recebe clique", () => {
    const { container } = render(<BookSpine />);
    const overlay = spine(container).querySelector<HTMLElement>(
      ".pointer-events-none",
    );

    expect(overlay).not.toBeNull();
    expect(overlay!.className).toContain("left-0");
    expect(overlay!.className).toContain("inset-y-0");
    expect(overlay!.style.background).toContain("linear-gradient");
  });

  it("a lombada é mais larga na capa grande do que na miniatura", () => {
    const { container: small } = render(<BookSpine />);
    const { container: large } = render(<BookSpine depth="lg" />);

    expect(
      spine(small).querySelector(".pointer-events-none")!.className,
    ).toContain("w-3");
    expect(
      spine(large).querySelector(".pointer-events-none")!.className,
    ).toContain("w-5");
  });

  it("corta o conteúdo no raio de quem usa", () => {
    const { container } = render(
      <BookSpine className="rounded-xl">
        <span>capa</span>
      </BookSpine>,
    );
    const el = spine(container);

    expect(el.className).toContain("overflow-hidden");
    expect(el.className).toContain("rounded-xl");
    expect(el.textContent).toBe("capa");
  });
});
