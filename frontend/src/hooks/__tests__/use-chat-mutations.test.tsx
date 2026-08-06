import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { useSendMessage } from "../use-chat-mutations";

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(async () => ({ id: "m-1", group_id: "g-1" })),
  },
}));

const GROUP = "g-1";
const USER = { id: "u-1", name: "Ana", avatar: null };

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

/**
 * A URL da imagem não é escolha do cliente (#232): o upload devolve chave e uma
 * presigned URL de preview, e só a chave viaja no POST. A URL fica no
 * otimista local, onde expirar não custa nada.
 */
describe("useSendMessage — mídia", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockClear();
  });

  it("envia a chave e não a URL de preview", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSendMessage(GROUP, USER), { wrapper });

    act(() => {
      result.current.mutate({
        content_type: "image",
        media_key: "media/g-1/abc.webp",
        thumbnail_key: "media/g-1/abc_thumb.webp",
        previewUrl: "https://cdn.example.com/media/g-1/abc.webp?X-Amz-Signature=xyz",
      });
    });

    await waitFor(() => expect(api.post).toHaveBeenCalled());

    const body = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
    expect(body.media_key).toBe("media/g-1/abc.webp");
    expect(body.thumbnail_key).toBe("media/g-1/abc_thumb.webp");
    expect(body).not.toHaveProperty("previewUrl");
    expect(body).not.toHaveProperty("media_url");
  });
});
