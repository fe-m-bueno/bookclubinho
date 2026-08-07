import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

// `display_name` vem de /users/me. Controlamos o retorno para reproduzir o caso
// que motivou a correção: o dado chega *depois* da montagem do formulário.
const currentUser = vi.fn();
vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => currentUser(),
}));

import { StepProfileForm } from "../step-profile-form";
import { QueryWrapper } from "@/test-utils/query";

const DISPLAY_NAME_LABEL = "Nome de exibição";

describe("StepProfileForm — nome de exibição herdado do registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.mockReturnValue({ data: undefined });
  });

  it("preenche o campo com o display_name já persistido", async () => {
    currentUser.mockReturnValue({ data: { display_name: "Marina Rocha" } });

    render(<StepProfileForm onNext={vi.fn()} />, { wrapper: QueryWrapper });

    await waitFor(() => {
      expect(screen.getByLabelText(DISPLAY_NAME_LABEL)).toHaveValue("Marina Rocha");
    });
  });

  it("deixa o campo vazio quando o usuário não tem display_name", async () => {
    currentUser.mockReturnValue({ data: { display_name: null } });

    render(<StepProfileForm onNext={vi.fn()} />, { wrapper: QueryWrapper });

    expect(screen.getByLabelText(DISPLAY_NAME_LABEL)).toHaveValue("");
  });

  it("preenche mesmo quando o usuário chega depois da montagem", async () => {
    const { rerender } = render(<StepProfileForm onNext={vi.fn()} />, {
      wrapper: QueryWrapper,
    });

    expect(screen.getByLabelText(DISPLAY_NAME_LABEL)).toHaveValue("");

    currentUser.mockReturnValue({ data: { display_name: "Marina Rocha" } });
    rerender(<StepProfileForm onNext={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(DISPLAY_NAME_LABEL)).toHaveValue("Marina Rocha");
    });
  });

  it("não sobrescreve o que a pessoa já digitou", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StepProfileForm onNext={vi.fn()} />, {
      wrapper: QueryWrapper,
    });

    await user.type(screen.getByLabelText(DISPLAY_NAME_LABEL), "Outro nome");

    currentUser.mockReturnValue({ data: { display_name: "Marina Rocha" } });
    rerender(<StepProfileForm onNext={vi.fn()} />);

    expect(screen.getByLabelText(DISPLAY_NAME_LABEL)).toHaveValue("Outro nome");
  });
});
