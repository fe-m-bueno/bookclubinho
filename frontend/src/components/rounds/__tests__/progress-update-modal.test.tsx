import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProgressUpdateModal } from "../progress-update-modal";

// Mock useAuthSubmit
const submitMock = vi.fn();
vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: ({ onSuccess }: { onSuccess: () => void }) => ({
    submit: submitMock,
    loading: false,
  }),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

const defaultProps = {
  roundId: "round-1",
  bookPageCount: 300,
  currentPage: 50,
  currentPercentage: 16,
  onUpdated: vi.fn(),
  onFinished: vi.fn(),
  open: true,
  onOpenChange: vi.fn(),
};

beforeEach(() => {
  submitMock.mockClear();
});

describe("ProgressUpdateModal", () => {
  it("renders title and current percentage", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    expect(screen.getByText("Atualizar Progresso")).toBeInTheDocument();
    expect(screen.getByText(/Progresso atual: 16%/)).toBeInTheDocument();
  });

  it("renders 3 tabs: Página, Capítulo, %", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    expect(screen.getByRole("tab", { name: "Página" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Capítulo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "%" })).toBeInTheDocument();
  });

  it("shows page input with bookPageCount label", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    expect(screen.getByText(/de 300/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Página atual/)).toBeInTheDocument();
  });

  it("clicking Salvar submits page payload", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    const input = screen.getByLabelText(/Página atual/);
    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(submitMock).toHaveBeenCalledWith(
      expect.stringContaining('"current_page":100'),
    );
    expect(submitMock).toHaveBeenCalledWith(
      expect.stringContaining('"progress_type":"page"'),
    );
  });

  it("Capítulo tab is rendered and initially inactive", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    const tab = screen.getByRole("tab", { name: "Capítulo" });
    expect(tab).toHaveAttribute("aria-selected", "false");
  });

  it("% tab is rendered and initially inactive", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    const tab = screen.getByRole("tab", { name: "%" });
    expect(tab).toHaveAttribute("aria-selected", "false");
  });

  it("Página tab is active by default", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    const tab = screen.getByRole("tab", { name: "Página" });
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("shows optional note textarea", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    expect(screen.getByLabelText(/Nota/)).toBeInTheDocument();
  });

  it("includes note in payload when filled", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/Nota/), {
      target: { value: "Adorei o capítulo 3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(submitMock).toHaveBeenCalledWith(
      expect.stringContaining('"note":"Adorei o capítulo 3"'),
    );
  });

  it("shows 'Terminei!' button", () => {
    render(<ProgressUpdateModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Terminei/i })).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(<ProgressUpdateModal {...defaultProps} open={false} />);
    expect(screen.queryByText("Atualizar Progresso")).not.toBeInTheDocument();
  });
});
