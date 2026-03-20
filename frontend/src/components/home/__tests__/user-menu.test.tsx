import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenu } from "../user-menu";
import type { UserMe } from "@/lib/types/user";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

// Mock csrf
vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn(),
  withCsrf: (h?: Record<string, string>) => h ?? {},
}));

// Mock Drawer and Popover (keep as stubs)
vi.mock("@/components/ui/drawer", () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: () => <input type="checkbox" />,
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

const mockUser: UserMe = {
  id: "user-1",
  email: "test@example.com",
  username: "testuser",
  display_name: "Test User",
  avatar_url: null,
  status_text: "Lendo muito",
  auth_provider: "local",
  preferred_genres: ["fantasia"],
  onboarding_completed: true,
  email_notifications: {},
  streak_current: 5,
  streak_longest: 10,
  streak_last_update: null,
  total_reading_time_minutes: 120,
  timezone: "America/Sao_Paulo",
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("UserMenu", () => {
  it("renders the user avatar trigger button", () => {
    render(<UserMenu user={mockUser} />);
    const buttons = screen.getAllByRole("button", { name: /menu do usuário/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("shows user display_name", () => {
    render(<UserMenu user={mockUser} />);
    // Both desktop (Popover) and mobile (Drawer) render the same content
    expect(screen.getAllByText("Test User").length).toBeGreaterThan(0);
  });

  it("shows @username", () => {
    render(<UserMenu user={mockUser} />);
    expect(screen.getAllByText("@testuser").length).toBeGreaterThan(0);
  });

  it("shows status_text when present", () => {
    render(<UserMenu user={mockUser} />);
    expect(screen.getAllByText("Lendo muito").length).toBeGreaterThan(0);
  });

  it("shows initials fallback when no avatar", () => {
    render(<UserMenu user={mockUser} />);
    // "TE" is first 2 chars of "Test User"
    const initials = screen.getAllByText("TE");
    expect(initials.length).toBeGreaterThan(0);
  });
});
