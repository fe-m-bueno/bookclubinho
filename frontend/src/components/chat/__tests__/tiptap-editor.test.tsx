import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TiptapEditor } from "../tiptap-editor";

/**
 * O Tiptap avisa por `console.warn` quando duas extensões têm o mesmo nome, e o
 * aviso é o sintoma de um problema real: qual configuração vence — `autolink`,
 * `openOnClick`, os atributos de HTML — passa a depender da ordem de registro.
 * Espionar o warn é o que prova que não há duplicata, porque a lista de
 * extensões resolvida não é exposta pelo `useEditor`.
 */
describe("TiptapEditor", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function warningsSobreDuplicata(): string[] {
    return warn.mock.calls
      .map((args: unknown[]) => args.map((a) => String(a)).join(" "))
      .filter((msg: string) => /duplicate extension/i.test(msg));
  }

  it("monta sem registrar duas extensões com o mesmo nome", async () => {
    render(<TiptapEditor onSend={vi.fn()} />);

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeInTheDocument();
    });

    expect(warningsSobreDuplicata()).toEqual([]);
  });

  it("aplica no link os atributos que a configuração pede", async () => {
    // `autolink` só age ao digitar, então o que se afirma aqui é a outra metade
    // da configuração: os `HTMLAttributes`. Sem eles, trocar a origem da extensão
    // deixaria os links do chat sem `rel="noopener"` — e nada reclamaria.
    const { container } = render(
      <TiptapEditor
        onSend={vi.fn()}
        initialContent='<p><a href="https://example.com">exemplo</a></p>'
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".ProseMirror a")).toBeInTheDocument();
    });

    const link = container.querySelector("a")!;
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
