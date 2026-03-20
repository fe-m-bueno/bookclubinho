import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginPage from "../page";

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

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form in password mode by default", () => {
    render(<LoginPage />);

    expect(screen.getByText("Bem-vindo de volta")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar com Google" })
    ).toBeInTheDocument();
  });

  it("shows validation errors on empty submit", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByText("E-mail é obrigatório")).toBeInTheDocument();
      expect(screen.getByText("Senha é obrigatória")).toBeInTheDocument();
    });
  });

  it("switches to magic link mode and back", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText("Entrar com link mágico"));

    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar link mágico" })
    ).toBeInTheDocument();

    await user.click(screen.getByText("Entrar com senha"));

    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  });

  it("preserves email when toggling modes", async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("E-mail"), "test@example.com");
    await user.click(screen.getByText("Entrar com link mágico"));

    expect(screen.getByLabelText("E-mail")).toHaveValue("test@example.com");

    await user.click(screen.getByText("Entrar com senha"));

    expect(screen.getByLabelText("E-mail")).toHaveValue("test@example.com");
  });

  it("calls login API on valid submit", async () => {
    const mockPush = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vi.mocked(await import("next/navigation")) as any).useRouter = () =>
      ({ push: mockPush });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("E-mail"), "test@example.com");
    await user.type(screen.getByLabelText("Senha"), "password123");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/login"),
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
    });

    fetchSpy.mockRestore();
  });

  it("shows error toast on 401 response", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 401 })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText("E-mail"), "test@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Credenciais inválidas");
    });

    vi.restoreAllMocks();
  });

  it("calls magic link API on valid submit", async () => {
    const { toast } = await import("sonner");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByText("Entrar com link mágico"));
    await user.type(screen.getByLabelText("E-mail"), "test@example.com");
    await user.click(
      screen.getByRole("button", { name: "Enviar link mágico" })
    );

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/magic-link"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Link enviado! Verifique seu e-mail."
      );
    });

    fetchSpy.mockRestore();
  });

  it("renders register link", () => {
    render(<LoginPage />);

    const link = screen.getByRole("link", { name: "Criar conta" });
    expect(link).toHaveAttribute("href", "/auth/register");
  });

  it("has correct autocomplete attributes", () => {
    render(<LoginPage />);

    expect(screen.getByLabelText("E-mail")).toHaveAttribute(
      "autocomplete",
      "email"
    );
    expect(screen.getByLabelText("Senha")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
  });
});
