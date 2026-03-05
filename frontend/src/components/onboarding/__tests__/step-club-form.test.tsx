import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { useGroupCodeCheck } from "@/hooks/use-group-code-check";
import { StepClubForm } from "../step-club-form";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    motion: {
      div: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => {
        const htmlProps = Object.fromEntries(
          Object.entries(props).filter(
            ([key]) =>
              ![
                "variants",
                "initial",
                "animate",
                "exit",
                "custom",
                "transition",
                "layout",
                "whileTap",
              ].includes(key),
          ),
        );
        return <div {...htmlProps}>{children}</div>;
      },
      p: ({
        children,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => {
        const htmlProps = Object.fromEntries(
          Object.entries(props).filter(
            ([key]) =>
              ![
                "variants",
                "initial",
                "animate",
                "exit",
                "custom",
                "transition",
              ].includes(key),
          ),
        );
        return <p {...htmlProps}>{children}</p>;
      },
    },
    useReducedMotion: () => false,
  };
});

vi.mock("react-confetti", () => ({
  default: () => <div data-testid="confetti" />,
}));

vi.mock("@/hooks/use-group-code-check", () => ({
  INVITE_CODE_CHARS: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  useGroupCodeCheck: vi.fn().mockReturnValue({ status: "idle", group: null }),
}));

const mockUseGroupCodeCheck = vi.mocked(useGroupCodeCheck);

function mockGroupCodeCheck(
  status: string,
  group: { name: string; photo_url: string | null; member_count: number } | null = null,
) {
  mockUseGroupCodeCheck.mockReturnValue({ status: status as any, group });
}

describe("StepClubForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGroupCodeCheck("idle");
    mockPush.mockClear();
  });

  it("renders both cards", () => {
    render(<StepClubForm onBack={vi.fn()} />);

    expect(screen.getByText("Tenho um código")).toBeInTheDocument();
    expect(screen.getByText("Criar novo clube")).toBeInTheDocument();
  });

  it("calls onBack when Voltar clicked", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    render(<StepClubForm onBack={onBack} />);

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows Pular por agora link", () => {
    render(<StepClubForm onBack={vi.fn()} />);
    expect(screen.getByText("Pular por agora")).toBeInTheDocument();
  });

  it("formats input to uppercase with dash", async () => {
    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    const input = screen.getByLabelText("Código de convite");
    await user.type(input, "abcd2345");
    expect(input).toHaveValue("ABCD-2345");
  });

  it("Entrar button is disabled when status is not valid", () => {
    mockGroupCodeCheck("idle");
    render(<StepClubForm onBack={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
  });

  it("Entrar button is enabled when status is valid", () => {
    mockGroupCodeCheck("valid", {
      name: "Clube",
      photo_url: null,
      member_count: 3,
    });
    render(<StepClubForm onBack={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("shows group info after validation", () => {
    mockGroupCodeCheck("valid", {
      name: "Clube Literário",
      photo_url: null,
      member_count: 5,
    });
    render(<StepClubForm onBack={vi.fn()} />);

    expect(screen.getByText("Clube Literário")).toBeInTheDocument();
    expect(screen.getByText("5 membros")).toBeInTheDocument();
  });

  it("shows not found message on 404", () => {
    mockGroupCodeCheck("not_found");
    render(<StepClubForm onBack={vi.fn()} />);

    expect(screen.getByText("Clube não encontrado.")).toBeInTheDocument();
  });

  it("join flow: POST /groups/join + POST /onboarding/complete", async () => {
    mockGroupCodeCheck("valid", {
      name: "Clube",
      photo_url: null,
      member_count: 3,
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "OK", group_id: "123" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: "OK" }),
      } as Response);

    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    const joinCall = fetchSpy.mock.calls[0];
    expect(joinCall[0]).toContain("/api/v1/groups/join");

    const completeCall = fetchSpy.mock.calls[1];
    expect(completeCall[0]).toContain("/api/v1/onboarding/complete");
  });

  it("skip flow: POST /onboarding/complete", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "OK" }),
    } as Response);

    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    await user.click(screen.getByText("Pular por agora"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/onboarding/complete"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("create flow: POST /onboarding/complete", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "OK" }),
    } as Response);

    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Criar clube" }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/onboarding/complete"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows 409 toast on already member", async () => {
    mockGroupCodeCheck("valid", {
      name: "Clube",
      photo_url: null,
      member_count: 3,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: "Você já faz parte deste clube." }),
    } as Response);

    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Você já faz parte deste clube.");
    });
  });

  it("shows 403 toast on group full", async () => {
    mockGroupCodeCheck("valid", {
      name: "Clube",
      photo_url: null,
      member_count: 8,
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Este clube está cheio." }),
    } as Response);

    const user = userEvent.setup();
    render(<StepClubForm onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Este clube está cheio.");
    });
  });
});
