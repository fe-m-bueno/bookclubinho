import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { PasswordInput } from "../password-input";

describe("PasswordInput", () => {
  it("renders as password type by default", () => {
    render(<PasswordInput id="pw" />);
    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("password");
  });

  it("toggles visibility on button click", async () => {
    const user = userEvent.setup();
    render(
      <PasswordInput
        id="pw"
        showLabel="Mostrar senha"
        hideLabel="Ocultar senha"
      />
    );

    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.type).toBe("password");

    await user.click(screen.getByLabelText("Mostrar senha"));
    expect(input.type).toBe("text");

    await user.click(screen.getByLabelText("Ocultar senha"));
    expect(input.type).toBe("password");
  });

  it("uses custom show/hide labels", async () => {
    const user = userEvent.setup();
    render(
      <PasswordInput
        id="pw"
        showLabel="Show"
        hideLabel="Hide"
      />
    );

    expect(screen.getByLabelText("Show")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Show"));
    expect(screen.getByLabelText("Hide")).toBeInTheDocument();
  });

  it("spreads additional props to input", () => {
    render(
      <PasswordInput
        id="pw"
        placeholder="Enter password"
        autoComplete="new-password"
      />
    );

    const input = document.getElementById("pw") as HTMLInputElement;
    expect(input.placeholder).toBe("Enter password");
    expect(input.autocomplete).toBe("new-password");
  });
});
