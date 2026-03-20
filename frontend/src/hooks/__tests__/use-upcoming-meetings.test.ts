import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useUpcomingMeetings } from "../use-upcoming-meetings";
import type { UpcomingMeetingsResponse } from "@/lib/types/meeting";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useUpcomingMeetings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns meetings on success", async () => {
    const mockData: UpcomingMeetingsResponse = {
      meetings: [
        {
          id: "m1",
          title: "Encontro mensal",
          scheduled_at: new Date(Date.now() + 86400000).toISOString(),
          duration_minutes: 60,
          meeting_type: "in_person",
          group_id: "g1",
          group_name: "Clube Literário",
          group_photo_url: null,
          my_rsvp_status: "going",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const { result } = renderHook(() => useUpcomingMeetings(3), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data?.meetings).toHaveLength(1);
    expect(result.current.data?.meetings[0].group_name).toBe("Clube Literário");
  });

  it("errors on fetch failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Error", { status: 500 }),
    );

    const { result } = renderHook(() => useUpcomingMeetings(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
