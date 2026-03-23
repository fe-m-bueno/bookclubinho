import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MeetingDetailClient } from "../meeting-detail-client";
import type { MeetingResponse } from "@/lib/types/meeting";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-meeting-detail", () => ({
  useMeetingDetail: vi.fn(),
}));

vi.mock("@/hooks/use-meeting-mutations", () => ({
  useUpdateRsvpStandalone: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDeleteMeetingStandalone: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useDownloadIcs: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockMeeting: MeetingResponse = {
  id: "m1",
  group_id: "g1",
  round_id: null,
  title: "Encontro de Março",
  description: "Discussão sobre o livro do mês",
  location: "Biblioteca Municipal",
  meeting_type: "in_person",
  virtual_link: null,
  scheduled_at: new Date(Date.now() + 86400000).toISOString(),
  duration_minutes: 120,
  created_by: "u1",
  creator_username: "alice",
  rsvps: [
    {
      user_id: "u1",
      username: "alice",
      display_name: "Alice Silva",
      avatar_url: null,
      status: "going",
      responded_at: new Date().toISOString(),
    },
    {
      user_id: "u2",
      username: "bob",
      display_name: "Bob",
      avatar_url: null,
      status: "maybe",
      responded_at: new Date().toISOString(),
    },
  ],
  rsvp_counts: { going: 1, maybe: 1, not_going: 0, pending: 0 },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    ({
      ...QueryClientProvider({ client: qc, children }),
    }) as any;
}

describe("MeetingDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders meeting title and details when loaded", async () => {
    const { useMeetingDetail } = await import("@/hooks/use-meeting-detail");
    (useMeetingDetail as any).mockReturnValue({
      data: mockMeeting,
      isLoading: false,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <MeetingDetailClient meetingId="m1" />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Encontro de Março")).toBeInTheDocument();
    expect(screen.getByText("Discussão sobre o livro do mês")).toBeInTheDocument();
    expect(screen.getByText("Biblioteca Municipal")).toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", async () => {
    const { useMeetingDetail } = await import("@/hooks/use-meeting-detail");
    (useMeetingDetail as any).mockReturnValue({
      data: null,
      isLoading: true,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <MeetingDetailClient meetingId="m1" />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Carregando detalhes do encontro")).toBeInTheDocument();
  });

  it("displays participants list", async () => {
    const { useMeetingDetail } = await import("@/hooks/use-meeting-detail");
    (useMeetingDetail as any).mockReturnValue({
      data: mockMeeting,
      isLoading: false,
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <MeetingDetailClient meetingId="m1" />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Alice Silva")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });
});
