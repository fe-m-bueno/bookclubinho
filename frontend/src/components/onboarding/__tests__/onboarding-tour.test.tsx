import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMarkCompleted = vi.fn();
let mockCompleted = false;

vi.mock("@/hooks/use-tour-completed", () => ({
  useTourCompleted: () => ({
    completed: mockCompleted,
    markCompleted: mockMarkCompleted,
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => {
    const htmlProps = Object.fromEntries(
      Object.entries(props).filter(
        ([key]) => !["variant", "size", "asChild"].includes(key)
      )
    );
    return <button {...htmlProps}>{children}</button>;
  },
}));

type JoyrideProps = {
  steps: Array<{ target: string; content: string }>;
  run: boolean;
  callback: (data: { status: string; action: string }) => void;
  tooltipComponent: React.ComponentType<{
    continuous: boolean;
    index: number;
    step: { content: string };
    size: number;
    backProps: Record<string, unknown>;
    primaryProps: Record<string, unknown>;
    skipProps: Record<string, unknown>;
    isLastStep: boolean;
  }>;
  continuous: boolean;
  showSkipButton: boolean;
};

vi.mock("react-joyride", () => {
  const STATUS = { FINISHED: "finished", SKIPPED: "skipped" };
  const ACTIONS = { CLOSE: "close" };

  function MockJoyride(props: JoyrideProps) {
    if (!props.run) return null;
    const Tooltip = props.tooltipComponent;
    const step = props.steps[0];
    return (
      <div data-testid="joyride">
        <Tooltip
          continuous={props.continuous}
          index={0}
          step={step}
          size={props.steps.length}
          backProps={{ "data-testid": "back-button" }}
          primaryProps={{ "data-testid": "primary-button" }}
          skipProps={{
            "data-testid": "skip-button",
            onClick: () =>
              props.callback({ status: "skipped", action: "skip" }),
          }}
          isLastStep={false}
        />
      </div>
    );
  }

  return { default: MockJoyride, STATUS, ACTIONS };
});

import { OnboardingTour } from "../onboarding-tour";

describe("OnboardingTour", () => {
  beforeEach(() => {
    mockCompleted = false;
    mockMarkCompleted.mockClear();
  });

  it("does not render when tour is already completed", () => {
    mockCompleted = true;
    const { container } = render(<OnboardingTour />);
    expect(container.innerHTML).toBe("");
  });

  it("renders tooltip with first step content", () => {
    render(<OnboardingTour />);
    expect(
      screen.getByText(
        "Aqui ficam seus clubes do livro. Toque em um para entrar!"
      )
    ).toBeInTheDocument();
  });

  it("skip button calls markCompleted via callback", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<OnboardingTour />);

    const skipButton = screen.getByTestId("skip-button");
    expect(skipButton).toHaveTextContent("Pular tour");
    await user.click(skipButton);

    expect(mockMarkCompleted).toHaveBeenCalledTimes(1);
  });

  it("renders step counter", () => {
    render(<OnboardingTour />);
    expect(screen.getByText("1/6")).toBeInTheDocument();
  });

  it("does not render back button on first step", () => {
    render(<OnboardingTour />);
    expect(screen.queryByText("Voltar")).not.toBeInTheDocument();
  });

  it("renders primary button with Próximo text", () => {
    render(<OnboardingTour />);
    const primaryButton = screen.getByTestId("primary-button");
    expect(primaryButton).toHaveTextContent("Próximo");
  });
});
