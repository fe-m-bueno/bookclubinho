import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProgressHeader } from "../progress-header";

describe("ProgressHeader", () => {
  const labels = ["Perfil", "Preferências", "Pronto"];

  it("renders all step labels", () => {
    render(<ProgressHeader currentStep={0} stepLabels={labels} />);

    expect(screen.getByText("Perfil")).toBeInTheDocument();
    expect(screen.getByText("Preferências")).toBeInTheDocument();
    expect(screen.getByText("Pronto")).toBeInTheDocument();
  });

  it("highlights current step label with font-semibold", () => {
    render(<ProgressHeader currentStep={1} stepLabels={labels} />);

    expect(screen.getByText("Preferências")).toHaveClass("font-semibold");
    expect(screen.getByText("Perfil")).not.toHaveClass("font-semibold");
    expect(screen.getByText("Pronto")).not.toHaveClass("font-semibold");
  });

  it("renders progress bar", () => {
    render(<ProgressHeader currentStep={0} stepLabels={labels} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders progress bar on last step", () => {
    render(<ProgressHeader currentStep={2} stepLabels={labels} />);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});
