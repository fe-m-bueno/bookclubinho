import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RegisterPage from "../page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => null,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders register form with all fields", () => {
    render(<RegisterPage />);

    expect(
      screen.getByRole("heading", { name: "Criar conta" })
    ).toBeInTheDocument();
    expect(screen.getByText("Junte-se ao clube")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmar senha")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar conta" })
    ).toBeInTheDocument();
  });

  it("shows validation errors on empty submit", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(screen.getByText("Nome é obrigatório")).toBeInTheDocument();
      expect(screen.getByText("E-mail é obrigatório")).toBeInTheDocument();
      expect(screen.getByText("Mínimo de 8 caracteres")).toBeInTheDocument();
      expect(screen.getByText("Confirme sua senha")).toBeInTheDocument();
    });
  });

  it("shows error for password shorter than 8 characters", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome"), "Alice");
    await user.type(screen.getByLabelText("E-mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Senha"), "short");
    await user.type(screen.getByLabelText("Confirmar senha"), "short");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(screen.getByText("Mínimo de 8 caracteres")).toBeInTheDocument();
    });
  });

  it("shows error when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome"), "Alice");
    await user.type(screen.getByLabelText("E-mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Senha"), "password123");
    await user.type(screen.getByLabelText("Confirmar senha"), "different123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(screen.getByText("As senhas não coincidem")).toBeInTheDocument();
    });
  });

  it("shows success screen after successful registration", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 201 })
    );

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome"), "Alice");
    await user.type(screen.getByLabelText("E-mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Senha"), "password123");
    await user.type(screen.getByLabelText("Confirmar senha"), "password123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(screen.getByText("Verifique seu e-mail")).toBeInTheDocument();
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reenviar e-mail" })
      ).toBeInTheDocument();
      expect(screen.getByText("Voltar para o login")).toBeInTheDocument();
    });

    vi.restoreAllMocks();
  });

  it("calls register API with correct payload", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 201 })
    );

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome"), "Alice");
    await user.type(screen.getByLabelText("E-mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Senha"), "password123");
    await user.type(screen.getByLabelText("Confirmar senha"), "password123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/register"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    fetchSpy.mockRestore();
  });

  it("shows error toast on 429 response", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 429 })
    );

    const user = userEvent.setup();
    render(<RegisterPage />);

    await user.type(screen.getByLabelText("Nome"), "Alice");
    await user.type(screen.getByLabelText("E-mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Senha"), "password123");
    await user.type(screen.getByLabelText("Confirmar senha"), "password123");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Muitas tentativas. Aguarde um momento."
      );
    });

    vi.restoreAllMocks();
  });

  it("renders login link in footer", () => {
    render(<RegisterPage />);

    const link = screen.getByRole("link", { name: "Entrar" });
    expect(link).toHaveAttribute("href", "/auth/login");
  });

  it("has correct autocomplete attributes", () => {
    render(<RegisterPage />);

    expect(screen.getByLabelText("Nome")).toHaveAttribute(
      "autocomplete",
      "name"
    );
    expect(screen.getByLabelText("E-mail")).toHaveAttribute(
      "autocomplete",
      "email"
    );
    expect(screen.getByLabelText("Senha")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
    expect(screen.getByLabelText("Confirmar senha")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const passwordInput = screen.getByLabelText("Senha");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByLabelText("Mostrar senha"));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByLabelText("Ocultar senha"));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  it("toggles confirm password visibility", async () => {
    const user = userEvent.setup();
    render(<RegisterPage />);

    const confirmInput = screen.getByLabelText("Confirmar senha");
    expect(confirmInput).toHaveAttribute("type", "password");

    await user.click(screen.getByLabelText("Mostrar confirmação de senha"));
    expect(confirmInput).toHaveAttribute("type", "text");

    await user.click(screen.getByLabelText("Ocultar confirmação de senha"));
    expect(confirmInput).toHaveAttribute("type", "password");
  });
});
