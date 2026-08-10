import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookMark } from "../book-mark";

/**
 * A marca substituiu o 📚 nos headers de auth (#322). O que importa garantir é
 * que ela continue decorativa e continue sendo *um* desenho: os dois tamanhos
 * partem das mesmas medidas, e a landing, o login e o registro consomem daqui em
 * vez de redesenhar.
 */
describe("BookMark", () => {
  it("é decorativa — não entra na árvore de acessibilidade", () => {
    const { container } = render(<BookMark />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("desenha a lombada e os três fios da capa", () => {
    const { container } = render(<BookMark />);

    // A lombada é o gradiente que o `BookSpine` põe na borda esquerda.
    expect(container.querySelector("[class*='inset-y-0'][class*='left-0']"))
      .toBeInTheDocument();
    expect(container.querySelectorAll(".h-px")).toHaveLength(3);
  });

  it("o tamanho de header é menor que o do ornamento", () => {
    const { container: pequeno } = render(<BookMark size="sm" />);
    const { container: grande } = render(<BookMark size="lg" />);

    expect(pequeno.firstElementChild).toHaveClass("h-14", "w-10");
    expect(grande.firstElementChild).toHaveClass("h-20", "w-14");
  });
});
