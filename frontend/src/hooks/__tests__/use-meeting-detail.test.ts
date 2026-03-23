import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useMeetingDetail } from "../use-meeting-detail";
import type { MeetingResponse } from "@/lib/types/meeting";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api-fetch", () => ({
  apiFetch: vi.fn(),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useMeetingDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns meeting detail on success", async () => {
    const mockMeeting: MeetingResponse = {
      id: "m1",
      group_id: "g1",
      round_id: null,
      title: "Encontro mensal",
      description: "Discussão sobre o livro",
      location: "Casa da Maria",
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
          display_name: "Alice",
          avatar_url: null,
          status: "going",
          responded_at: new Date().toISOString(),
        },
      ],
      rsvp_counts: { going: 1, maybe: 0, not_going: 0, pending: 0 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { apiFetch } = await import("@/lib/api-fetch");
    (apiFetch as any).mockResolvedValueOnce(mockMeeting);

    const { result } = renderHook(() => useMeetingDetail("m1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.title).toBe("Encontro mensal");
    expect(result.current.data?.rsvps).toHaveLength(1);
  });
});
