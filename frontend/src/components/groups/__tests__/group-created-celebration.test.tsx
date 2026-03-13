import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";

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
    AnimatePresence: ({ children }: React.PropsWithChildren) => (
      <>{children}</>
    ),
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
                "whileHover",
                "whileTap",
              ].includes(key),
          ),
        );
        return <div {...htmlProps}>{children}</div>;
      },
    },
    useReducedMotion: () => false,
  };
});

vi.mock("react-confetti", () => ({
  default: () => <div data-testid="confetti" />,
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="qr-code" data-value={value} />
  ),
}));

vi.mock("@/hooks/use-window-size", () => ({
  useWindowSize: () => ({ width: 1024, height: 768 }),
}));

vi.mock("@/lib/format-invite-code", () => ({
  formatInviteCode: (code: string) => {
    const clean = code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 8);
    return clean.length > 4 ? clean.slice(0, 4) + "-" + clean.slice(4) : clean;
  },
}));

import { GroupCreatedCelebration } from "../group-created-celebration";

describe("GroupCreatedCelebration", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    writeTextMock.mockResolvedValue(undefined);

    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });
  });

  const defaultProps = {
    groupId: "abc-123",
    groupName: "Leitores Noturnos",
    inviteCode: "ABCD1234",
  };

  it("renders group name", () => {
    render(<GroupCreatedCelebration {...defaultProps} />);

    expect(screen.getByText("Clube criado!")).toBeInTheDocument();
    expect(screen.getByText("Leitores Noturnos")).toBeInTheDocument();
  });

  it("renders formatted invite code with dash", () => {
    render(<GroupCreatedCelebration {...defaultProps} />);

    expect(screen.getByText("ABCD-1234")).toBeInTheDocument();
  });

  it("renders confetti", () => {
    render(<GroupCreatedCelebration {...defaultProps} />);

    expect(screen.getByTestId("confetti")).toBeInTheDocument();
  });

  it("renders QR code with join URL", () => {
    render(<GroupCreatedCelebration {...defaultProps} />);

    const qr = screen.getByTestId("qr-code");
    expect(qr).toBeInTheDocument();
    expect(qr.getAttribute("data-value")).toContain(
      "/groups/join?code=ABCD1234",
    );
  });

  it("shows success toast on copy code click", async () => {
    const user = userEvent.setup();
    render(<GroupCreatedCelebration {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /copiar código/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Copiado!");
    });
  });

  it("navigates to group on button click", async () => {
    const user = userEvent.setup();
    render(<GroupCreatedCelebration {...defaultProps} />);

    await user.click(
      screen.getByRole("button", { name: /ir para o clube/i }),
    );

    expect(mockPush).toHaveBeenCalledWith("/groups/abc-123");
  });

  it("share button shows success toast when navigator.share is not available", async () => {
    const user = userEvent.setup();
    render(<GroupCreatedCelebration {...defaultProps} />);

    await user.click(screen.getByRole("button", { name: /compartilhar/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Link copiado!");
    });
  });
});
