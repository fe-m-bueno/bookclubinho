import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GoogleIcon } from "../google-icon";

describe("GoogleIcon", () => {
  it("renders an SVG with aria-hidden", () => {
    const { container } = render(<GoogleIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("applies className prop", () => {
    const { container } = render(<GoogleIcon className="h-4 w-4" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("h-4", "w-4");
  });
});
