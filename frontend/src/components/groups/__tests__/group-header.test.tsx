import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/groups/g1/chat",
}));

import { GroupHeader } from "../group-header";
import type { GroupDetailResponse } from "@/lib/types/group";

const baseGroup: GroupDetailResponse = {
  id: "g1",
  name: "Clube Literário",
  description: "Um clube de leitura",
  photo_url: null,
  invite_code: "ABC123",
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
  current_round: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("GroupHeader", () => {
  it("renders group name", () => {
    render(<GroupHeader group={baseGroup} />);

    expect(
      screen.getByRole("heading", { name: "Clube Literário" }),
    ).toBeInTheDocument();
  });

  it("renders group name initial as fallback", () => {
    render(<GroupHeader group={baseGroup} />);

    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("renders member avatars", () => {
    render(<GroupHeader group={baseGroup} />);

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });

  it("shows settings gear for admin (invite_code not null)", () => {
    render(<GroupHeader group={baseGroup} />);

    expect(
      screen.getByRole("link", { name: "Configurações do grupo" }),
    ).toBeInTheDocument();
  });

  it("hides settings gear for non-admin (invite_code null)", () => {
    const nonAdminGroup = { ...baseGroup, invite_code: null };

    render(<GroupHeader group={nonAdminGroup} />);

    expect(
      screen.queryByRole("link", { name: "Configurações do grupo" }),
    ).not.toBeInTheDocument();
  });

  it("settings link points to group settings page", () => {
    render(<GroupHeader group={baseGroup} />);

    const link = screen.getByRole("link", { name: "Configurações do grupo" });
    expect(link).toHaveAttribute("href", "/groups/g1/settings");
  });
});
