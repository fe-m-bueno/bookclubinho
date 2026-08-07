import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const motionPropsFilter = ([key]: [string, unknown]) =>
  !["variants", "initial", "animate", "exit", "custom", "transition", "whileHover", "whileTap"].includes(key);

function makeMotionComponent(Tag: string) {
  return ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(Object.entries(props).filter(motionPropsFilter));
    return React.createElement(Tag, htmlProps, children);
  };
}

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
    motion: {
      div: makeMotionComponent("div"),
      span: makeMotionComponent("span"),
      button: makeMotionComponent("button"),
      img: makeMotionComponent("img"),
      p: makeMotionComponent("p"),
      h2: makeMotionComponent("h2"),
    },
    useReducedMotion: () => false,
  };
});

import { OnboardingWizard } from "../onboarding-wizard";
import { QueryWrapper } from "@/test-utils/query";

describe("OnboardingWizard", () => {
  it("renders step 1 (profile) by default", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    expect(screen.getByText("Perfil")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome de usuário")).toBeInTheDocument();
    expect(screen.getByLabelText("Nome de exibição")).toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo" })).toBeInTheDocument();
  });

  it("renders progress header with all steps", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    expect(screen.getByText("Perfil")).toBeInTheDocument();
    expect(screen.getByText("Preferências")).toBeInTheDocument();
    expect(screen.getByText("Clube")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("põe o toggle de tema em linha com o indicador, não por cima dele", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    const toggle = screen.getByRole("button", { name: "Alternar tema" });
    const lastStep = screen.getByText("Clube");

    // Em 375px o card ocupa a largura toda; um toggle `absolute` no canto
    // cobria o último passo. Dividir a mesma linha é o que impede a colisão.
    const row = toggle.parentElement;
    expect(row).not.toBeNull();
    expect(row).toHaveClass("flex");
    expect(row?.contains(lastStep)).toBe(true);
    expect(toggle.className).not.toMatch(/absolute/);
  });

  it("renders avatar upload area", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    expect(
      screen.getByRole("button", { name: "Enviar foto de perfil" })
    ).toBeInTheDocument();
  });

  it("has Próximo button disabled initially (form invalid)", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
  });

  it("shows username validation error for invalid format", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    const usernameInput = screen.getByLabelText("Nome de usuário");
    await user.type(usernameInput, "1invalid");

    const displayNameInput = screen.getByLabelText("Nome de exibição");
    await user.click(displayNameInput);

    expect(
      await screen.findByText("Deve começar com letra. Apenas letras, números e _")
    ).toBeInTheDocument();
  });

  it("shows char counter for status field", () => {
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    expect(screen.getByText("0/100")).toBeInTheDocument();
  });

  it("updates char counter as user types", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />, { wrapper: QueryWrapper });

    const statusInput = screen.getByLabelText("Status");
    await user.type(statusInput, "Hello");

    expect(screen.getByText("5/100")).toBeInTheDocument();
  });
});
