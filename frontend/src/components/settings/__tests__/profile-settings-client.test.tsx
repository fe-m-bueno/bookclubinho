import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import type { UserMe } from "@/lib/types/user";
import { jsonResponse } from "@/test-utils/http";

// Mock all heavy dependencies
vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: mockUser, isLoading: false }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/settings/profile-avatar-upload", () => ({
  ProfileAvatarUpload: () => <div data-testid="avatar-upload" />,
}));

vi.mock("@/components/shared/genre-selector", () => ({
  GenreSelector: () => <div data-testid="genre-selector" />,
}));

vi.mock("@/components/onboarding/username-field", () => ({
  UsernameField: () => <input data-testid="username-field" />,
}));

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn(),
  withCsrf: (h?: Record<string, string>) => h ?? {},
}));

vi.mock("date-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("date-fns")>();
  return { ...actual };
});

const mockUser: UserMe = {
  id: "user-1",
  email: "test@example.com",
  username: "testuser",
  display_name: "Test User",
  avatar_url: null,
  status_text: null,
  auth_provider: "local",
  preferred_genres: ["fantasia"],
  onboarding_completed: true,
  email_notifications: { meetings: true, invites: true, auth: true, approaching_end: true, all_updates: true },
  streak_current: 5,
  streak_longest: 10,
  streak_last_update: null,
  total_reading_time_minutes: 240,
  timezone: "America/Sao_Paulo",
  auto_sync_hardcover: false,
  hardcover_connected: false,
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

import { ProfileSettingsClient } from "../profile-settings-client";

describe("ProfileSettingsClient", () => {
  it("renders profile info card", () => {
    render(<ProfileSettingsClient />);
    expect(screen.getByText("Informações do perfil")).toBeTruthy();
  });

  it("renders account info card with email", () => {
    render(<ProfileSettingsClient />);
    expect(screen.getByText("Informações da conta")).toBeTruthy();
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("renders stats card", () => {
    render(<ProfileSettingsClient />);
    expect(screen.getByText("Estatísticas")).toBeTruthy();
    // 240 minutes = 4h
    expect(screen.getByText("4h")).toBeTruthy();
  });

  it("renders save button", () => {
    render(<ProfileSettingsClient />);
    const saveBtn = screen.getByRole("button", { name: /salvar/i });
    expect(saveBtn).toBeTruthy();
  });

  it("renders auth method badge", () => {
    render(<ProfileSettingsClient />);
    expect(screen.getByText("Senha")).toBeTruthy();
  });

  /**
   * O form não podia ser salvo no primeiro carregamento.
   *
   * `useForm` não declarava `defaultValues`, então no primeiro render
   * `watch("timezone")` era `undefined` e o `Select` do Radix montava
   * descontrolado. O `reset()` do `useEffect` chegava depois, com o `user`
   * carregado, e o trigger ficava preso no "Selecione..." — o React avisava a
   * troca de descontrolado para controlado no console.
   *
   * O efeito era pior que o visual: `timezone: z.string().min(1)` reprovava, o
   * `handleSubmit` nunca chamava o `onSubmit`, e o botão não dava sinal nenhum.
   * A mensagem aparecia no rodapé do form, longe de quem clicou.
   *
   * Reproduzido no browser: mudar o Status e salvar não disparava requisição
   * nenhuma. Escolhendo o fuso à mão — um valor que o usuário já tinha — o save
   * funcionava.
   */
  describe("salvar no primeiro carregamento", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn().mockImplementation(async () => jsonResponse(mockUser));
    });

    /**
     * O botão é `disabled={!isDirty}` de propósito, então a repro precisa de uma
     * edição de verdade — foi como o bug apareceu no browser: mudar o Status e
     * salvar não disparava requisição nenhuma.
     */
    function editarStatus() {
      fireEvent.change(screen.getByLabelText("Status"), {
        target: { value: "lendo bastante" },
      });
    }

    it("o fuso do usuário aparece no select, não o placeholder", () => {
      render(<ProfileSettingsClient />);
      expect(screen.queryByText("Selecione...")).not.toBeInTheDocument();
    });

    it("submete sem que o usuário toque no fuso horário", async () => {
      render(<ProfileSettingsClient />);
      editarStatus();

      fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/v1/users/me",
          expect.objectContaining({ method: "PATCH" }),
        ),
      );
    });

    it("manda o fuso que o usuário já tinha", async () => {
      render(<ProfileSettingsClient />);
      editarStatus();

      fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.timezone).toBe("America/Sao_Paulo");
      expect(body.status_text).toBe("lendo bastante");
    });

    it("não reprova a validação do fuso", async () => {
      render(<ProfileSettingsClient />);
      editarStatus();

      fireEvent.click(screen.getByRole("button", { name: /salvar/i }));

      // A validação é assíncrona: sem esperar, a asserção passa antes de a
      // mensagem existir e não afirma nada.
      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      // A mensagem morava no rodapé do form, fora da vista de quem clicou.
      expect(
        screen.queryByText("Selecione um fuso horário"),
      ).not.toBeInTheDocument();
    });
  });
});
