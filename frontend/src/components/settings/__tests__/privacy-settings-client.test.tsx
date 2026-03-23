import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UserMe } from "@/lib/types/user";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUser: UserMe = {
  id: "user-1",
  email: "test@example.com",
  username: "testuser",
  display_name: "Test User",
  avatar_url: null,
  status_text: null,
  auth_provider: "local",
  preferred_genres: [],
  onboarding_completed: true,
  email_notifications: { meetings: true, invites: true, auth: true, approaching_end: true, all_updates: true },
  streak_current: 0,
  streak_longest: 0,
  streak_last_update: null,
  total_reading_time_minutes: 0,
  timezone: "America/Sao_Paulo",
  auto_sync_hardcover: false,
  hardcover_connected: false,
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockExportMutation = { mutateAsync: vi.fn(), isPending: false };
const mockDeleteMutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: mockUser, isLoading: false }),
}));

vi.mock("@/hooks/use-data-export", () => ({
  useRequestDataExport: () => mockExportMutation,
  useDeleteAccount: () => mockDeleteMutation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn(),
  withCsrf: (h?: Record<string, string>) => h ?? {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { PrivacySettingsClient } from "../privacy-settings-client";

describe("PrivacySettingsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage cooldown for each test
    localStorage.removeItem("data_export_cooldown");
  });

  it("renders export card with title and description", () => {
    render(<PrivacySettingsClient />);
    expect(screen.getByText("Exportar meus dados")).toBeTruthy();
    expect(screen.getByText(/receba um arquivo/i)).toBeTruthy();
  });

  it("renders export button", () => {
    render(<PrivacySettingsClient />);
    expect(
      screen.getByRole("button", { name: /solicitar exporta/i }),
    ).toBeTruthy();
  });

  it("renders delete account card with danger styling", () => {
    render(<PrivacySettingsClient />);
    expect(screen.getByText("Excluir minha conta")).toBeTruthy();
    expect(screen.getByText(/permanente/i)).toBeTruthy();
  });

  it("renders delete account button", () => {
    render(<PrivacySettingsClient />);
    expect(
      screen.getByRole("button", { name: /excluir conta/i }),
    ).toBeTruthy();
  });

  it("opens delete dialog step 1 when delete button is clicked", () => {
    render(<PrivacySettingsClient />);
    // Click the first "Excluir conta" button (the trigger, not the dialog title)
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText(/seu nome e foto/i)).toBeTruthy();
  });

  it("shows step 1 consequences list", () => {
    render(<PrivacySettingsClient />);
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    expect(screen.getByText(/anonimizados/i)).toBeTruthy();
    expect(screen.getByText(/perdera acesso/i)).toBeTruthy();
  });

  it("advances to step 2 when 'Continuar' is clicked in step 1", () => {
    render(<PrivacySettingsClient />);
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByText("Confirmar exclusao")).toBeTruthy();
    expect(screen.getByPlaceholderText("EXCLUIR")).toBeTruthy();
  });

  it("keeps step 2 'Continuar' disabled until 'EXCLUIR' typed", () => {
    render(<PrivacySettingsClient />);
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    const continueBtn = screen.getByRole("button", { name: /continuar/i });
    expect(continueBtn.hasAttribute("disabled")).toBe(true);

    const input = screen.getByPlaceholderText("EXCLUIR");
    fireEvent.change(input, { target: { value: "EXCLUIR" } });
    expect(continueBtn.hasAttribute("disabled")).toBe(false);
  });

  it("advances to step 3 (password) for local auth after typing EXCLUIR", () => {
    render(<PrivacySettingsClient />);
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    // Step 1 -> 2
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    // Type confirmation
    const input = screen.getByPlaceholderText("EXCLUIR");
    fireEvent.change(input, { target: { value: "EXCLUIR" } });
    // Step 2 -> 3
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByText("Confirmar senha")).toBeTruthy();
    expect(screen.getByLabelText("Senha atual")).toBeTruthy();
  });

  it("shows 'Excluir permanentemente' button in step 3", () => {
    render(<PrivacySettingsClient />);
    const deleteButtons = screen.getAllByRole("button", { name: /excluir conta/i });
    fireEvent.click(deleteButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    const input = screen.getByPlaceholderText("EXCLUIR");
    fireEvent.change(input, { target: { value: "EXCLUIR" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(
      screen.getByRole("button", { name: /excluir permanentemente/i }),
    ).toBeTruthy();
  });

  it("disables export button while in cooldown from localStorage", () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    localStorage.setItem("data_export_cooldown", futureDate);
    render(<PrivacySettingsClient />);
    const btn = screen.getByRole("button", { name: /dispon/i });
    expect(btn.hasAttribute("disabled")).toBe(true);
  });
});
