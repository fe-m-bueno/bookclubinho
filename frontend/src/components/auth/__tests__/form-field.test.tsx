import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FormField } from "../form-field";

describe("FormField", () => {
  it("renders label and children", () => {
    render(
      <FormField label="E-mail" htmlFor="email">
        <input id="email" />
      </FormField>
    );

    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
  });

  it("renders error message when provided", () => {
    render(
      <FormField label="E-mail" htmlFor="email" error="Campo obrigatório">
        <input id="email" />
      </FormField>
    );

    expect(screen.getByText("Campo obrigatório")).toBeInTheDocument();
  });

  it("does not render error when not provided", () => {
    const { container } = render(
      <FormField label="E-mail" htmlFor="email">
        <input id="email" />
      </FormField>
    );

    expect(
      container.querySelector(".text-destructive")
    ).not.toBeInTheDocument();
  });
});
