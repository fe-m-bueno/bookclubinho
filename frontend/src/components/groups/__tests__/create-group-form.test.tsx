import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const motionPropsFilter = ([key]: [string, unknown]) =>
  ![
    "variants",
    "initial",
    "animate",
    "exit",
    "custom",
    "transition",
    "whileHover",
    "whileTap",
  ].includes(key);

function makeMotionComponent(Tag: string) {
  return ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(
      Object.entries(props).filter(motionPropsFilter),
    );
    return React.createElement(Tag, htmlProps, children);
  };
}

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: React.PropsWithChildren) => (
      <>{children}</>
    ),
    motion: {
      div: makeMotionComponent("div"),
      button: makeMotionComponent("button"),
      img: makeMotionComponent("img"),
    },
  };
});

import { CreateGroupForm } from "../create-group-form";

describe("CreateGroupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields", () => {
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    expect(screen.getByLabelText("Nome do clube")).toBeInTheDocument();
    expect(screen.getByLabelText("Descrição")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar clube" }),
    ).toBeInTheDocument();
  });

  it("submit button is disabled when name is empty", () => {
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Criar clube" })).toBeDisabled();
  });

  it("submit button is disabled when name is too short", async () => {
    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "A");

    expect(screen.getByRole("button", { name: "Criar clube" })).toBeDisabled();
  });

  it("submit button is enabled when name has 2+ characters", async () => {
    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "AB");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Criar clube" }),
      ).toBeEnabled();
    });
  });

  it("shows character counter for name", async () => {
    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Teste");

    expect(screen.getByText("5/50")).toBeInTheDocument();
  });

  it("shows character counter for description", async () => {
    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Descrição"), "Uma descrição");

    expect(screen.getByText("13/200")).toBeInTheDocument();
  });

  it("submits form data and calls onSuccess", async () => {
    const onSuccess = vi.fn();
    const mockResponse = {
      id: "123",
      name: "Meu Clube",
      description: null,
      photo_url: null,
      invite_code: "ABCD1234",
      created_at: "2026-01-01T00:00:00Z",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Meu Clube");
    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/groups/"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        }),
      );
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
    });
  });

  it("shows toast on 422 validation error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Nome inválido" }),
    } as Response);

    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Teste");
    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Nome inválido");
    });
  });

  it("shows toast on 401 unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Unauthorized" }),
    } as Response);

    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Teste");
    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Sessão expirada. Faça login novamente.",
      );
    });
  });

  it("shows toast on 429 rate limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ detail: "Rate limited" }),
    } as Response);

    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Teste");
    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Muitas tentativas. Aguarde um momento.",
      );
    });
  });

  it("shows toast on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network"));

    const user = userEvent.setup();
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Nome do clube"), "Teste");
    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Erro de conexão. Verifique sua internet.",
      );
    });
  });

  it("has photo upload with correct aria-label", () => {
    render(<CreateGroupForm onSuccess={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Enviar foto do grupo" }),
    ).toBeInTheDocument();
  });
});
