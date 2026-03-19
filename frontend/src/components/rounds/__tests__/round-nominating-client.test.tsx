import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}
import type { GroupDetailResponse } from "@/lib/types/group";
import type { RoundDetailResponse } from "@/lib/types/round";

const mockRefetch = vi.fn();

const adminGroup: GroupDetailResponse = {
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

const nominatingRound: RoundDetailResponse = {
  id: "r1",
  round_number: 1,
  book_id: null,
  book_title: null,
  book_author: null,
  book_cover_url: null,
  book_page_count: null,
  status: "nominating",
  deadline: null,
  started_at: "2026-01-01T00:00:00Z",
  finished_at: null,
  created_at: "2026-01-01T00:00:00Z",
  nominations: [],
};

vi.mock("@/lib/contexts/group-context", () => ({
  useGroup: vi.fn(),
}));

vi.mock("@/hooks/use-current-round", () => ({
  useCurrentRound: vi.fn(),
}));

vi.mock("@/hooks/use-book-search", () => ({
  useBookSearch: vi.fn(() => ({ results: [], loading: false })),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { useGroup } from "@/lib/contexts/group-context";
import { useCurrentRound } from "@/hooks/use-current-round";
import { RoundNominatingClient } from "../round-nominating-client";

const mockedUseGroup = vi.mocked(useGroup);
const mockedUseCurrentRound = vi.mocked(useCurrentRound);

describe("RoundNominatingClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseGroup.mockReturnValue({ group: adminGroup, refetch: mockRefetch });
  });

  it("shows skeleton while loading", () => {
    mockedUseCurrentRound.mockReturnValue({
      round: null,
      loading: true,
      error: null,
      refetch: mockRefetch,
    });

    const { container } = renderWithProviders(<RoundNominatingClient />);
    // Skeleton renders with animate-pulse divs
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("shows error with retry button", () => {
    mockedUseCurrentRound.mockReturnValue({
      round: null,
      loading: false,
      error: "Erro ao carregar rodada. Tente novamente.",
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(
      screen.getByText("Erro ao carregar rodada. Tente novamente."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /tentar novamente/i }),
    ).toBeInTheDocument();
  });

  it("shows empty state with create button for admin when no round", () => {
    mockedUseCurrentRound.mockReturnValue({
      round: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(screen.getByText("Nenhuma rodada ativa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /criar rodada/i }),
    ).toBeInTheDocument();
  });

  it("shows empty state without create button for member when no round", () => {
    mockedUseGroup.mockReturnValue({ group: memberGroup, refetch: mockRefetch });
    mockedUseCurrentRound.mockReturnValue({
      round: null,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(screen.getByText("Nenhuma rodada ativa")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /criar rodada/i }),
    ).not.toBeInTheDocument();
  });

  it("renders nominating UI when round is in nominating status", () => {
    mockedUseCurrentRound.mockReturnValue({
      round: nominatingRound,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(screen.getByText("Rodada #1")).toBeInTheDocument();
    expect(screen.getByText("Fase de indicações")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/buscar livro/i),
    ).toBeInTheDocument();
  });

  it("admin sees start voting button in nominating phase", () => {
    mockedUseCurrentRound.mockReturnValue({
      round: nominatingRound,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(
      screen.getByRole("button", { name: /iniciar votação/i }),
    ).toBeInTheDocument();
  });

  it("member does not see start voting button", () => {
    mockedUseGroup.mockReturnValue({ group: memberGroup, refetch: mockRefetch });
    mockedUseCurrentRound.mockReturnValue({
      round: nominatingRound,
      loading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithProviders(<RoundNominatingClient />);

    expect(
      screen.queryByRole("button", { name: /iniciar votação/i }),
    ).not.toBeInTheDocument();
  });
});
