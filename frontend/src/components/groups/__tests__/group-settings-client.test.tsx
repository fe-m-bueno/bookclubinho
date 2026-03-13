import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GroupDetailResponse } from "@/lib/types/group";

const mockRefetch = vi.fn();

const adminGroup: GroupDetailResponse = {
  id: "g1",
  name: "Clube Literário",
  description: "Um clube de leitura",
  photo_url: null,
  invite_code: "ABCD1234",
  max_members: 8,
  member_count: 2,
  members: [
    {
      user_id: "u1",
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      role: "admin",
      joined_at: "2026-01-01T00:00:00Z",
    },
    {
      user_id: "u2",
      username: "bob",
      display_name: "Bob",
      avatar_url: null,
      role: "member",
      joined_at: "2026-01-02T00:00:00Z",
    },
  ],
  current_user_id: "u1",
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

const memberGroup: GroupDetailResponse = {
  ...adminGroup,
  invite_code: null,
  current_user_id: "u2",
};

vi.mock("@/lib/contexts/group-context", () => ({
  useGroup: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/groups/g1/settings",
}));

import { useGroup } from "@/lib/contexts/group-context";
import { GroupSettingsClient } from "../group-settings-client";

const mockedUseGroup = vi.mocked(useGroup);

describe("GroupSettingsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin sees all sections", () => {
    mockedUseGroup.mockReturnValue({ group: adminGroup, refetch: mockRefetch });

    render(<GroupSettingsClient />);

    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("Informações do clube")).toBeInTheDocument();
    expect(screen.getByText("Membros (2/8)")).toBeInTheDocument();
    expect(screen.getByText("Código de convite")).toBeInTheDocument();
    expect(screen.getByText("Zona de perigo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /excluir grupo/i }),
    ).toBeInTheDocument();
  });

  it("member sees only members and danger zone with leave option", () => {
    mockedUseGroup.mockReturnValue({ group: memberGroup, refetch: mockRefetch });

    render(<GroupSettingsClient />);

    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("Membros (2/8)")).toBeInTheDocument();
    expect(screen.getByText("Zona de perigo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sair do grupo/i }),
    ).toBeInTheDocument();

    // Admin-only sections should not be present
    expect(screen.queryByText("Informações do clube")).not.toBeInTheDocument();
    expect(screen.queryByText("Código de convite")).not.toBeInTheDocument();
  });

  it("admin sees member action buttons for other members", () => {
    mockedUseGroup.mockReturnValue({ group: adminGroup, refetch: mockRefetch });

    render(<GroupSettingsClient />);

    // Current user should show (Você) label
    expect(screen.getByText("(Você)")).toBeInTheDocument();

    // Should have promote/remove buttons for Bob
    expect(
      screen.getByRole("button", { name: "Promover a admin" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remover membro" }),
    ).toBeInTheDocument();
  });

  it("member sees read-only member list without action buttons", () => {
    mockedUseGroup.mockReturnValue({ group: memberGroup, refetch: mockRefetch });

    render(<GroupSettingsClient />);

    expect(screen.queryByRole("button", { name: "Promover a admin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remover membro" })).not.toBeInTheDocument();
  });
});
