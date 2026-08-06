import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import type { GroupDetailResponse } from "@/lib/types/group";
import { GroupMembersSection } from "../group-members-section";
import { errorResponse, jsonResponse } from "@/test-utils/http";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn(async () => {}),
  withCsrf: (h: Record<string, string> = {}) => ({ ...h, "X-CSRF-Token": "t" }),
}));

const group: GroupDetailResponse = {
  id: "g1",
  name: "Clube Literário",
  description: null,
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

/** Cada ação pede confirmação antes de disparar o request. */
function confirmar(nome: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar?" }));
}

describe("GroupMembersSection", () => {
  const refetch = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation(async () => jsonResponse({}));
  });

  it("promove um membro pelo cliente, com o método certo", async () => {
    render(
      <GroupMembersSection group={group} isAdmin refetch={refetch} />,
    );
    confirmar("Promover a admin");

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/groups/g1/members/u2",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Membro promovido!");
    expect(refetch).toHaveBeenCalled();
  });

  it("remove um membro pelo cliente", async () => {
    render(
      <GroupMembersSection group={group} isAdmin refetch={refetch} />,
    );
    confirmar("Remover membro");

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/groups/g1/members/u2",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Membro removido!");
  });

  /**
   * O ganho de passar pelo cliente: o `detail` do backend chega à UI. O idioma
   * copiado à mão (`res.json().catch(() => null)?.detail ?? genérico`) existia
   * em cada call site, e onde faltava o usuário via só o genérico.
   */
  it("mostra o detail do backend quando a promoção falha", async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(async () =>
        errorResponse(403, "Só o criador do clube pode promover."),
      );

    render(
      <GroupMembersSection group={group} isAdmin refetch={refetch} />,
    );
    confirmar("Promover a admin");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Só o criador do clube pode promover.",
      ),
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("rede fora do ar não vira mensagem de backend", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    render(
      <GroupMembersSection group={group} isAdmin refetch={refetch} />,
    );
    confirmar("Remover membro");

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Erro de conexão. Verifique sua internet.",
      ),
    );
  });

  it("quem não é admin não vê as ações", () => {
    render(
      <GroupMembersSection
        group={{ ...group, current_user_id: "u2" }}
        isAdmin={false}
        refetch={refetch}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Remover membro" }),
    ).not.toBeInTheDocument();
  });
});
