import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    // jsdom não implementa medição de layout — o ProseMirror usa
    // `Range.getClientRects` para posicionar o cursor ao digitar/dar Enter.
    Range.prototype.getClientRects = () =>
      ({ item: () => null, length: 0 }) as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => new DOMRect();
    document.elementFromPoint = () => null;
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

  /**
   * #272: o editor limpava via `setTimeout` logo depois de chamar `onSend`,
   * sem olhar o resultado — texto do usuário sumia mesmo quando o envio
   * falhava. `onSend` agora pode devolver `false` para dizer "não limpe".
   */
  it("preserva o texto quando onSend recusa o envio", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockReturnValue(false);
    const { container } = render(<TiptapEditor onSend={onSend} />);

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeInTheDocument();
    });

    const editable = container.querySelector(".ProseMirror") as HTMLElement;
    editable.focus();
    await user.type(editable, "mensagem que vai falhar{Enter}");

    expect(onSend).toHaveBeenCalledWith(
      "mensagem que vai falhar",
      expect.anything(),
    );
    await waitFor(() => {
      expect(editable.textContent).toBe("mensagem que vai falhar");
    });
  });

  it("limpa o editor quando onSend aceita o envio", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockReturnValue(true);
    const { container } = render(<TiptapEditor onSend={onSend} />);

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeInTheDocument();
    });

    const editable = container.querySelector(".ProseMirror") as HTMLElement;
    editable.focus();
    await user.type(editable, "mensagem que vai passar{Enter}");

    await waitFor(() => {
      expect(editable.textContent).toBe("");
    });
  });
});
