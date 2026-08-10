import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/**
 * As entradas da /about.
 *
 * A página não serve de nada se ninguém chegar nela, e o caminho de
 * crescimento do app não passa pela landing: quem recebe convite cai em
 * `/groups/join?code=`, e quem clica num link de estante compartilhada cai em
 * `/shelf/[id]`. As duas renderizam deslogadas, e nas duas a pessoa vê uma
 * tela do produto sem nunca ter visto o produto.
 *
 * A quarta entrada — a landing — é coberta em
 * `components/landing/__tests__/landing-page.test.tsx`, e a de /settings em
 * `components/settings/__tests__/settings-shell.test.tsx`.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("code=ABCD2345"),
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("@/hooks/use-group-code-check", () => ({
  useGroupCodeCheck: () => ({
    status: "valid",
    group: { name: "Clube da Meia-Noite", photo_url: null, member_count: 5 },
  }),
}));

vi.mock("@/hooks/use-auth-submit", () => ({
  useAuthSubmit: () => ({ submit: vi.fn(), loading: false }),
}));

const serverGet = vi.fn();
vi.mock("@/lib/server-api", () => ({
  serverApi: { get: (...args: unknown[]) => serverGet(...args) },
}));

import JoinGroupPage from "@/app/groups/join/page";
import PublicShelfPage from "@/app/shelf/[id]/page";

describe("entradas para a /about", () => {
  it("o convite oferece a explicação antes de pedir cadastro", () => {
    render(<JoinGroupPage />);

    const link = screen.getByRole("link", { name: /o que é o bookclubinho/i });
    expect(link.getAttribute("href")).toBe("/about");
  });

  it("a estante pública leva à explicação pelo rodapé", async () => {
    serverGet.mockResolvedValue({
      group_name: "Clube da Meia-Noite",
      group_photo_url: null,
      books: [],
    });

    const page = await PublicShelfPage({
      params: Promise.resolve({ id: "estante-1" }),
    });
    render(page);

    const link = screen.getByRole("link", { name: /o que é o bookclubinho/i });
    expect(link.getAttribute("href")).toBe("/about");
  });
});
