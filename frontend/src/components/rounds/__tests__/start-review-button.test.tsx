import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const mockSubmit = vi.fn();
let mockLoading = false;

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: vi.fn(() => ({ submit: mockSubmit, loading: mockLoading })),
  JSON_HEADERS: { "Content-Type": "application/json" },
}));

import { StartReviewButton } from "../start-review-button";

describe("StartReviewButton", () => {
  it("renders the button", () => {
    mockLoading = false;
    render(<StartReviewButton roundId="r1" onStarted={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /abrir reviews/i }),
    ).toBeInTheDocument();
  });

  it("button is not disabled when not loading", () => {
    mockLoading = false;
    render(<StartReviewButton roundId="r1" onStarted={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /abrir reviews/i }),
    ).not.toBeDisabled();
  });

  it("shows loading spinner when loading", () => {
    mockLoading = true;
    const { container } = render(
      <StartReviewButton roundId="r1" onStarted={vi.fn()} />,
    );
    expect(container.querySelector(".animate-spin")).toBeTruthy();
    mockLoading = false;
  });
});
