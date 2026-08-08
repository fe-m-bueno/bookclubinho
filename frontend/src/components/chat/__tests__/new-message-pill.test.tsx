import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewMessagePill } from "../new-message-pill";

/**
 * O rótulo lido em voz alta era `2 nova(s) mensagem(ns) — rolar para o final`.
 * Leitor de tela não entende parênteses de plural: ele fala "nova abre
 * parênteses esse fecha parênteses". A pílula visível já escolhia entre
 * singular e plural; o rótulo agora faz o mesmo.
 */
describe("NewMessagePill", () => {
  it("não aparece sem mensagem nova", () => {
    render(<NewMessagePill count={0} onClick={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("fala no singular quando é uma só", () => {
    render(<NewMessagePill count={1} onClick={vi.fn()} />);
    expect(
      screen.getByRole("button", {
        name: "1 nova mensagem. Ir para o final da conversa",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 nova mensagem")).toBeInTheDocument();
  });

  it("fala no plural a partir de duas", () => {
    render(<NewMessagePill count={4} onClick={vi.fn()} />);
    expect(
      screen.getByRole("button", {
        name: "4 novas mensagens. Ir para o final da conversa",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("4 novas mensagens")).toBeInTheDocument();
  });

  it("leva para o final ao ser clicada", async () => {
    const onClick = vi.fn();
    render(<NewMessagePill count={2} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
