import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mockSubmit = vi.fn();
let mockLoading = false;

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: vi.fn(() => ({ submit: mockSubmit, loading: mockLoading })),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

import { FinalizeVotingButton } from "../finalize-voting-button";

describe("FinalizeVotingButton", () => {
  it("renders the button", () => {
    mockLoading = false;
    render(<FinalizeVotingButton roundId="r1" onFinalized={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /encerrar votação/i }),
    ).toBeInTheDocument();
  });

  it("button is not disabled when not loading", () => {
    mockLoading = false;
    render(<FinalizeVotingButton roundId="r1" onFinalized={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /encerrar votação/i }),
    ).not.toBeDisabled();
  });

  it("shows loading spinner when loading", () => {
    mockLoading = true;
    const { container } = render(
      <FinalizeVotingButton roundId="r1" onFinalized={vi.fn()} />,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    mockLoading = false;
  });
});
