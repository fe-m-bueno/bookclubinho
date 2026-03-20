import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsShell } from "../settings-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
  usePathname: () => "/settings/profile",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) => (
    <a href={href} onClick={onClick}>{children}</a>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

describe("SettingsShell", () => {
  it("renders nav links", () => {
    render(
      <SettingsShell>
        <div>content</div>
      </SettingsShell>
    );
    expect(screen.getAllByText("Perfil").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Conta").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Notificações").length).toBeGreaterThan(0);
  });

  it("renders children", () => {
    render(
      <SettingsShell>
        <div data-testid="child">Hello</div>
      </SettingsShell>
    );
    expect(screen.getAllByTestId("child").length).toBeGreaterThan(0);
  });

  it("renders Perfil link with correct href", () => {
    render(
      <SettingsShell>
        <div />
      </SettingsShell>
    );
    const links = screen.getAllByRole("link", { name: /perfil/i });
    expect(links.length).toBeGreaterThan(0);
    // At least one link should point to /settings/profile
    const profileLink = links.find((l) => l.getAttribute("href") === "/settings/profile");
    expect(profileLink).toBeTruthy();
  });
});
