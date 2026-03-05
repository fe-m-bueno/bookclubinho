import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { StepGenresForm } from "../step-genres-form";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return {
    ...actual,
    motion: {
      button: ({
        children,
        whileTap,
        ...props
      }: React.PropsWithChildren<Record<string, unknown>>) => {
        const htmlProps = Object.fromEntries(
          Object.entries(props).filter(
            ([key]) =>
              !["variants", "initial", "animate", "exit", "custom", "transition", "layout"].includes(key)
          )
        );
        return <button {...htmlProps}>{children}</button>;
      },
    },
    useReducedMotion: () => false,
  };
});

const mockGenres = [
  { slug: "fiction", display_name: "Ficção", emoji: "📖", description: "Ficção geral" },
  { slug: "fantasy", display_name: "Fantasia", emoji: "🧙", description: "Fantasia e magia" },
  { slug: "romance", display_name: "Romance", emoji: "💕", description: "Romance" },
  { slug: "thriller", display_name: "Thriller", emoji: "🔪", description: "Suspense" },
  { slug: "scifi", display_name: "Ficção Científica", emoji: "🚀", description: "Sci-fi" },
  { slug: "horror", display_name: "Horror", emoji: "👻", description: "Terror" },
  { slug: "mystery", display_name: "Mistério", emoji: "🔍", description: "Mistério" },
  { slug: "biography", display_name: "Biografia", emoji: "📝", description: "Biografias" },
  { slug: "history", display_name: "História", emoji: "🏛️", description: "Histórico" },
  { slug: "poetry", display_name: "Poesia", emoji: "🎭", description: "Poesia" },
  { slug: "comics", display_name: "HQs", emoji: "💬", description: "Quadrinhos" },
];

function mockFetchGenres() {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => mockGenres,
  } as Response);
}

async function renderAndWaitForGenres(onNext = vi.fn(), onBack = vi.fn()) {
  mockFetchGenres();
  const user = userEvent.setup();
  render(<StepGenresForm onNext={onNext} onBack={onBack} />);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Ficção" })).toBeInTheDocument();
  });
  return { user, onNext, onBack };
}

function getGenreButton(name: string) {
  return screen.getByRole("button", { name });
}

describe("StepGenresForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading skeletons initially", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(new Promise(() => {}));
    render(<StepGenresForm onNext={vi.fn()} onBack={vi.fn()} />);

    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBe(12);
  });

  it("renders genre cards after fetch resolves", async () => {
    await renderAndWaitForGenres();

    expect(getGenreButton("Ficção")).toBeInTheDocument();
    expect(getGenreButton("Fantasia")).toBeInTheDocument();
    expect(getGenreButton("Romance")).toBeInTheDocument();
  });

  it("toggling a card adds and removes selection", async () => {
    const { user } = await renderAndWaitForGenres();

    const card = getGenreButton("Ficção");
    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "true");

    await user.click(card);
    expect(card).toHaveAttribute("aria-pressed", "false");
  });

  it("updates counter on selection", async () => {
    const { user } = await renderAndWaitForGenres();

    expect(screen.getByText("0 de 10 selecionados")).toBeInTheDocument();

    await user.click(getGenreButton("Ficção"));
    expect(screen.getByText("1 de 10 selecionados")).toBeInTheDocument();
  });

  it("cannot select more than 10 genres", async () => {
    const { user } = await renderAndWaitForGenres();

    for (let i = 0; i < 10; i++) {
      await user.click(getGenreButton(mockGenres[i].display_name));
    }
    expect(screen.getByText("10 de 10 selecionados")).toBeInTheDocument();

    const eleventhCard = getGenreButton(mockGenres[10].display_name);
    await user.click(eleventhCard);
    expect(eleventhCard).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("10 de 10 selecionados")).toBeInTheDocument();
  });

  it("Próximo button disabled when 0 selected", async () => {
    await renderAndWaitForGenres();

    expect(screen.getByRole("button", { name: "Próximo" })).toBeDisabled();
  });

  it("Próximo button enabled when >= 1 selected", async () => {
    const { user } = await renderAndWaitForGenres();

    await user.click(getGenreButton("Ficção"));
    expect(screen.getByRole("button", { name: "Próximo" })).toBeEnabled();
  });

  it("calls onBack when Voltar clicked", async () => {
    const { user, onBack } = await renderAndWaitForGenres();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("submits correct slugs on form submission", async () => {
    const { user, onNext } = await renderAndWaitForGenres();

    await user.click(getGenreButton("Ficção"));
    await user.click(getGenreButton("Fantasia"));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledOnce();
    });

    const submitCall = vi.mocked(globalThis.fetch).mock.calls[1];
    expect(submitCall[0]).toContain("/api/v1/onboarding/preferences");
    const body = JSON.parse(submitCall[1]?.body as string);
    expect(body.preferred_genres).toHaveLength(2);
    expect(body.preferred_genres).toContain("fiction");
    expect(body.preferred_genres).toContain("fantasy");
  });

  it("shows error toast when genre fetch fails with non-OK response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);
    render(<StepGenresForm onNext={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro ao carregar gêneros.");
    });
  });

  it("shows error toast when genre fetch throws network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));
    render(<StepGenresForm onNext={vi.fn()} onBack={vi.fn()} />);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Erro de conexão. Verifique sua internet.");
    });
  });

  it("shows error toast on 422 submit response", async () => {
    const { user } = await renderAndWaitForGenres();

    await user.click(getGenreButton("Ficção"));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Gênero inválido" }),
    } as Response);

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Gênero inválido");
    });
  });

  it("shows error toast on 429 submit response", async () => {
    const { user } = await renderAndWaitForGenres();

    await user.click(getGenreButton("Ficção"));

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as Response);

    await user.click(screen.getByRole("button", { name: "Próximo" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Muitas tentativas. Aguarde um momento.");
    });
  });
});
