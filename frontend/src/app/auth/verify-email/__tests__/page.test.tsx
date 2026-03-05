import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import VerifyEmailPage from "../page";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
  Toaster: () => null,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({
    children,
  }: React.PropsWithChildren<Record<string, unknown>>) => <>{children}</>,
  motion: {
    div: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial, animate, exit, transition, ...props } = rest;
      void initial;
      void animate;
      void exit;
      void transition;
      return <div {...props}>{children}</div>;
    },
    circle: (props: Record<string, unknown>) => <circle {...props} />,
    path: (props: Record<string, unknown>) => <path {...props} />,
  },
}));

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("redirects to login when no token is present", () => {
    render(<VerifyEmailPage />);

    expect(mockReplace).toHaveBeenCalledWith("/auth/login");
  });

  it("shows loading state when token is present", async () => {
    mockSearchParams = new URLSearchParams("token=valid-token");
    let resolveFetch!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<VerifyEmailPage />);

    expect(screen.getByText("Verificando seu email...")).toBeInTheDocument();

    await act(async () => {
      resolveFetch(new Response(null, { status: 200 }));
    });
  });

  it("shows success state on 200 response", async () => {
    mockSearchParams = new URLSearchParams("token=valid-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    expect(screen.getByText("Email verificado!")).toBeInTheDocument();
    expect(screen.getByText("Sua conta está pronta.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir para login" })
    ).toHaveAttribute("href", "/auth/login");
  });

  it("shows error state on 400 response", async () => {
    mockSearchParams = new URLSearchParams("token=expired-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 400 })
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    expect(
      screen.getByText("Link expirado ou inválido")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reenviar verificação" })
    ).toHaveAttribute("href", "/auth/register");
    expect(
      screen.getByRole("link", { name: "Voltar para cadastro" })
    ).toHaveAttribute("href", "/auth/register");
  });

  it("shows generic error on 500 response", async () => {
    mockSearchParams = new URLSearchParams("token=some-token");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 500 })
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    expect(screen.getByText("Link inválido")).toBeInTheDocument();
  });

  it("shows generic error on network failure", async () => {
    mockSearchParams = new URLSearchParams("token=some-token");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      new Error("Network error")
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    expect(screen.getByText("Link inválido")).toBeInTheDocument();
  });

  it("shows countdown and redirects after success", async () => {
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams("token=valid-token");
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    // Flush microtasks to resolve fetch promise and trigger state update
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("Redirecionando em 3...")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Redirecionando em 2...")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("Redirecionando em 1...")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockPush).toHaveBeenCalledWith("/auth/login");

    vi.useRealTimers();
  });

  it("calls the correct API endpoint with the token", async () => {
    mockSearchParams = new URLSearchParams("token=my-token-123");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    await act(async () => {
      render(<VerifyEmailPage />);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "/api/v1/auth/verify-email?token=my-token-123"
      ),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );
  });
});
