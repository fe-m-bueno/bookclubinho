import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { UserMe } from "@/lib/types/user";

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
});
