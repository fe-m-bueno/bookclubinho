import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button, buttonVariants } from "../button";

describe("Button", () => {
  it("aplica active:scale para feedback de press", () => {
    render(<Button>Clique</Button>);
    expect(screen.getByRole("button")).toHaveClass("active:scale-[0.97]");
  });

  it("usa transição de propriedades específicas, não transition-all", () => {
    render(<Button>Clique</Button>);
    const button = screen.getByRole("button");
    expect(button.className).not.toContain("transition-all");
    expect(button.className).toContain(
      "transition-[transform,background-color,box-shadow,border-color]"
    );
  });

  it.each([
    "xs",
    "sm",
    "default",
    "lg",
    "icon-xs",
    "icon-sm",
    "icon",
    "icon-lg",
  ] as const)(
    "size %s expõe área de toque mínima de 44px via pseudo-elemento, sem mudar o tamanho visual",
    (size) => {
      render(<Button size={size}>x</Button>);
      const button = screen.getByRole("button");
      expect(button.className).toContain("after:min-h-11");
      expect(button.className).toContain("after:min-w-11");
      // desativado em dispositivos com ponteiro fino (mouse), não em touch
      expect(button.className).toContain("pointer-fine:after:hidden");
    }
  );

  it("não altera a altura visual dos tamanhos pequenos ao expor a área de toque", () => {
    const xsClasses = buttonVariants({ size: "xs" });
    const smClasses = buttonVariants({ size: "sm" });
    expect(xsClasses).toContain("h-6");
    expect(smClasses).toContain("h-8");
  });
});
