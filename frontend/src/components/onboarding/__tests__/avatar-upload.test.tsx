import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
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
      button: makeMotionComponent("button"),
      img: makeMotionComponent("img"),
    },
  };
});

import { AvatarUpload } from "../avatar-upload";

describe("AvatarUpload", () => {
  it("renders with placeholder when no file", () => {
    render(<AvatarUpload value={null} onChange={vi.fn()} />);

    const button = screen.getByRole("button", { name: "Enviar foto de perfil" });
    expect(button).toBeInTheDocument();
  });

  it("shows preview after selecting an image file", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(<AvatarUpload value={null} onChange={onChange} />);

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    rerender(<AvatarUpload value={file} onChange={onChange} />);

    const img = screen.getByAltText("Preview do avatar");
    expect(img).toBeInTheDocument();
  });

  it("calls onChange when valid image file is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AvatarUpload value={null} onChange={onChange} />);

    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    expect(onChange).toHaveBeenCalledWith(file);
  });

  it("does not call onChange for non-image files", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<AvatarUpload value={null} onChange={onChange} />);

    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("has accessible button with aria-label", () => {
    render(<AvatarUpload value={null} onChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Enviar foto de perfil" })
    ).toBeInTheDocument();
  });
});
