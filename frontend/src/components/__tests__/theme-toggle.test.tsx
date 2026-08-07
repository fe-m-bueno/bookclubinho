import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../theme-toggle";

/**
 * O provider roda com `defaultTheme="system"`, então enquanto o usuário não
 * escolher nada `theme` vale `"system"` — nem `"light"` nem `"dark"`. Comparar
 * `theme === "dark"` é falso nesse estado, e o primeiro clique acabava
 * gravando o tema que já estava em vigor: para quem usa o SO em dark, o botão
 * não respondia ao primeiro toque.
 *
 * `resolvedTheme` nunca é `"system"`, e é o que decide tanto o próximo tema
 * quanto o ícone.
 */

const setTheme = vi.fn();
const useThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => useThemeMock(),
}));

function comTema(theme: string, resolvedTheme: string) {
  useThemeMock.mockReturnValue({ theme, resolvedTheme, setTheme });
}

function botao() {
  return screen.getByRole("button", { name: "Alternar tema" });
}

/** lucide marca o ícone com `lucide-sun` / `lucide-moon` na className. */
function iconeDoBotao(): "sol" | "lua" | "nenhum" {
  const classe = botao().querySelector("svg")?.getAttribute("class") ?? "";
  if (classe.includes("sun")) return "sol";
  if (classe.includes("moon")) return "lua";
  return "nenhum";
}

beforeEach(() => {
  setTheme.mockClear();
});

describe("<ThemeToggle /> sem preferência salva", () => {
  it("com o SO em dark, o primeiro clique vai para light", async () => {
    comTema("system", "dark");
    render(<ThemeToggle />);

    await userEvent.click(botao());

    // Era aqui que quebrava: `theme` é "system", então a comparação com "dark"
    // dava falso e ele gravava "dark" — o tema que já estava na tela.
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("com o SO em light, o primeiro clique vai para dark", async () => {
    comTema("system", "light");
    render(<ThemeToggle />);

    await userEvent.click(botao());

    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("<ThemeToggle /> com preferência explícita", () => {
  it.each([
    ["dark", "light"],
    ["light", "dark"],
  ])("de %s vai para %s", async (atual, esperado) => {
    comTema(atual, atual);
    render(<ThemeToggle />);

    await userEvent.click(botao());

    expect(setTheme).toHaveBeenCalledWith(esperado);
  });
});

describe("ícone do <ThemeToggle />", () => {
  it("mostra a lua quando a página está escura", () => {
    comTema("system", "dark");
    render(<ThemeToggle />);

    expect(iconeDoBotao()).toBe("lua");
  });

  it("mostra o sol quando a página está clara", () => {
    comTema("system", "light");
    render(<ThemeToggle />);

    expect(iconeDoBotao()).toBe("sol");
  });

  it("não muda quando só a origem do tema muda", () => {
    // Mesma página escura, com e sem escolha explícita do usuário. Antes,
    // "system" mostrava a lua e "dark" mostrava o sol.
    comTema("system", "dark");
    const { unmount } = render(<ThemeToggle />);
    const comSystem = iconeDoBotao();
    unmount();

    comTema("dark", "dark");
    render(<ThemeToggle />);

    expect(iconeDoBotao()).toBe(comSystem);
  });
});
