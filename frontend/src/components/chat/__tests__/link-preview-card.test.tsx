import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, afterEach, vi } from "vitest";
import { LinkPreviewCard } from "../link-preview-card";

describe("LinkPreviewCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches previews through the same-origin API path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          url: "https://example.com/post",
          title: "Exemplo",
          description: "Descricao",
          image: null,
          site_name: "Example",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <LinkPreviewCard url="https://example.com/post" />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Exemplo")).toBeInTheDocument();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/v1/link-preview?url=https%3A%2F%2Fexample.com%2Fpost",
      { credentials: "include" }
    );
  });
});
