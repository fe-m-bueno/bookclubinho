import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import JoinGroupPage from "../page";

const pushMock = vi.fn();

vi.mock("next/navigation", () => {
  let params = new URLSearchParams("code=ABCD2345");
  return {
    useRouter: () => ({ push: pushMock }),
    useSearchParams: () => params,
    __setParams: (p: URLSearchParams) => {
      params = p;
    },
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
  withCsrf: (h: Record<string, string>) => h,
}));

describe("JoinGroupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading then group info for valid code", async () => {
    const groupData = {
      valid: true,
      name: "Clube Legal",
      photo_url: null,
      member_count: 3,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(groupData), { status: 200 }),
    );

    render(<JoinGroupPage />);

    expect(screen.getByText("Verificando convite...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Clube Legal")).toBeInTheDocument();
    });
    expect(screen.getByText("3 membros")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar no clube" }),
    ).toBeInTheDocument();
  });

  it("shows error for not found code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }),
    );

    render(<JoinGroupPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Convite invalido ou clube nao encontrado."),
      ).toBeInTheDocument();
    });
  });

  it("joins group on button click", async () => {
    const groupData = {
      valid: true,
      name: "Clube Legal",
      photo_url: null,
      member_count: 3,
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(groupData), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ group_id: "abc-123" }), { status: 200 }),
      );

    const user = userEvent.setup();
    render(<JoinGroupPage />);

    await waitFor(() => {
      expect(screen.getByText("Clube Legal")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Entrar no clube" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/groups/abc-123");
    });
  });

  it("shows no-code message when code param is missing", async () => {
    const nav = await import("next/navigation");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nav as any).__setParams(new URLSearchParams());

    render(<JoinGroupPage />);

    expect(
      screen.getByText("Codigo de convite nao informado."),
    ).toBeInTheDocument();

    // Restore for other tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nav as any).__setParams(new URLSearchParams("code=ABCD2345"));
  });
});
