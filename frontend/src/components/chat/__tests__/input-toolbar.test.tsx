import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InputToolbar } from "../input-toolbar";

function setup() {
  const onImageSelect = vi.fn();
  const onSendSpecial = vi.fn();
  const onSpoilerChange = vi.fn();
  const user = userEvent.setup({ delay: null });
  render(
    <InputToolbar
      onImageSelect={onImageSelect}
      onSendSpecial={onSendSpecial}
      onSpoilerChange={onSpoilerChange}
    />,
  );
  return { user, onImageSelect, onSendSpecial, onSpoilerChange };
}

async function openToolbar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Abrir ferramentas" }));
}

describe("InputToolbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("começa recolhida e revela as ações ao abrir", async () => {
    const { user } = setup();

    const toggle = screen.getByRole("button", { name: "Abrir ferramentas" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Enviar imagem" }),
    ).not.toBeInTheDocument();

    await user.click(toggle);

    expect(
      screen.getByRole("button", { name: "Fechar ferramentas" }),
    ).toHaveAttribute("aria-expanded", "true");
    for (const label of [
      "Enviar imagem",
      "Enviar GIF (em breve)",
      "Marcar capítulo",
      "Marcar página",
      "Compartilhar citação",
      "Marcar spoiler",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("mantém o botão de GIF desabilitado", async () => {
    const { user } = setup();
    await openToolbar(user);

    expect(
      screen.getByRole("button", { name: "Enviar GIF (em breve)" }),
    ).toBeDisabled();
  });

  // Chapter e Page vêm da mesma tabela de especificação: os dois casos garantem
  // que cada entrada continua gerando o próprio payload.
  it.each([
    {
      trigger: "Marcar capítulo",
      prompt: "Em qual capítulo?",
      placeholder: "Número do capítulo",
      value: "7",
      payload: {
        content_type: "chapter_marker",
        content_text: "Capítulo 7",
        reference_type: "chapter",
        reference_value: "7",
      },
    },
    {
      trigger: "Marcar página",
      prompt: "Em qual página?",
      placeholder: "Número da página",
      value: "42",
      payload: {
        content_type: "page_marker",
        content_text: "Página 42",
        reference_type: "page",
        reference_value: "42",
      },
    },
  ])("envia o marcador de $trigger", async (spec) => {
    const { user, onSendSpecial } = setup();
    await openToolbar(user);

    await user.click(screen.getByRole("button", { name: spec.trigger }));
    expect(await screen.findByText(spec.prompt)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(spec.placeholder), spec.value);
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSendSpecial).toHaveBeenCalledExactlyOnceWith(spec.payload);
    // Enviar recolhe a toolbar inteira
    expect(
      screen.getByRole("button", { name: "Abrir ferramentas" }),
    ).toBeInTheDocument();
  });

  it("só habilita o envio do marcador com um número válido", async () => {
    const { user } = setup();
    await openToolbar(user);
    await user.click(screen.getByRole("button", { name: "Marcar capítulo" }));

    const input = await screen.findByPlaceholderText("Número do capítulo");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await user.type(input, "0");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await user.clear(input);
    await user.type(input, "3");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("envia o marcador com Enter", async () => {
    const { user, onSendSpecial } = setup();
    await openToolbar(user);
    await user.click(screen.getByRole("button", { name: "Marcar página" }));

    const input = await screen.findByPlaceholderText("Número da página");
    await user.type(input, "12{Enter}");

    expect(onSendSpecial).toHaveBeenCalledExactlyOnceWith({
      content_type: "page_marker",
      content_text: "Página 12",
      reference_type: "page",
      reference_value: "12",
    });
  });

  it("envia citação com página opcional e exige o texto", async () => {
    const { user, onSendSpecial } = setup();
    await openToolbar(user);
    await user.click(
      screen.getByRole("button", { name: "Compartilhar citação" }),
    );

    const textarea = await screen.findByPlaceholderText("Citação do livro…");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await user.type(textarea, "  a coragem vem depois  ");
    await user.type(screen.getByPlaceholderText("Página (opcional)"), "88");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(onSendSpecial).toHaveBeenCalledExactlyOnceWith({
      content_type: "quote",
      content_text: "a coragem vem depois",
      reference_type: "quote",
      reference_value: "88",
    });
  });

  it("confirma spoiler com capítulo e mantém o botão destacado ao reabrir", async () => {
    const { user, onSpoilerChange } = setup();
    await openToolbar(user);
    await user.click(screen.getByRole("button", { name: "Marcar spoiler" }));

    await user.click(
      await screen.findByRole("checkbox", { name: "Marcar como spoiler" }),
    );
    await user.type(screen.getByPlaceholderText("Capítulo (opcional)"), "5");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onSpoilerChange).toHaveBeenCalledExactlyOnceWith(true, 5);

    // O estado de spoiler é da toolbar, não do popover: sobrevive ao recolher
    await openToolbar(user);
    expect(screen.getByRole("button", { name: "Marcar spoiler" })).toHaveClass(
      "text-destructive",
    );
  });

  it("confirma spoiler sem capítulo com chapter nulo", async () => {
    const { user, onSpoilerChange } = setup();
    await openToolbar(user);
    await user.click(screen.getByRole("button", { name: "Marcar spoiler" }));

    await user.click(await screen.findByRole("button", { name: "Confirmar" }));

    expect(onSpoilerChange).toHaveBeenCalledExactlyOnceWith(false, null);
  });

  it("repassa o arquivo escolhido e recolhe a toolbar", async () => {
    const { user, onImageSelect } = setup();
    await openToolbar(user);

    const file = new File(["x"], "capa.png", { type: "image/png" });
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await user.upload(input!, file);

    expect(onImageSelect).toHaveBeenCalledExactlyOnceWith(file);
    expect(
      screen.getByRole("button", { name: "Abrir ferramentas" }),
    ).toBeInTheDocument();
  });
});
