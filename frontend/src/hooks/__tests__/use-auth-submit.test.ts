import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthSubmit } from "../use-auth-submit";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("useAuthSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with loading=false", () => {
    const { result } = renderHook(() =>
      useAuthSubmit({
        url: "/api/test",
        onSuccess: vi.fn(),
      })
    );
    expect(result.current.loading).toBe(false);
  });

  it("calls onSuccess on ok response", async () => {
    const onSuccess = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const { result } = renderHook(() =>
      useAuthSubmit({ url: "/api/test", onSuccess })
    );

    await act(() => result.current.submit("{}"));

    expect(onSuccess).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);

    vi.restoreAllMocks();
  });

  it("shows rate limit toast on 429", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 429 })
    );

    const { result } = renderHook(() =>
      useAuthSubmit({ url: "/api/test", onSuccess: vi.fn() })
    );

    await act(() => result.current.submit("{}"));

    expect(toast.error).toHaveBeenCalledWith(
      "Muitas tentativas. Aguarde um momento."
    );

    vi.restoreAllMocks();
  });

  it("calls matched status handler", async () => {
    const handler = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 401 })
    );

    const { result } = renderHook(() =>
      useAuthSubmit({
        url: "/api/test",
        onSuccess: vi.fn(),
        statusHandlers: [{ status: 401, handler }],
      })
    );

    await act(() => result.current.submit("{}"));

    expect(handler).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("calls onSuccess for non-429 errors with antiEnumeration", async () => {
    const onSuccess = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 404 })
    );

    const { result } = renderHook(() =>
      useAuthSubmit({
        url: "/api/test",
        onSuccess,
        antiEnumeration: true,
      })
    );

    await act(() => result.current.submit("{}"));

    expect(onSuccess).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("shows connection error toast on fetch failure", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network"));

    const { result } = renderHook(() =>
      useAuthSubmit({ url: "/api/test", onSuccess: vi.fn() })
    );

    await act(() => result.current.submit("{}"));

    expect(toast.error).toHaveBeenCalledWith(
      "Erro de conexão. Verifique sua internet."
    );

    vi.restoreAllMocks();
  });

  it("sends request with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 200 })
    );

    const { result } = renderHook(() =>
      useAuthSubmit({ url: "/api/test", onSuccess: vi.fn() })
    );

    await act(() => result.current.submit("{}"));

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ credentials: "include" })
    );

    fetchSpy.mockRestore();
  });
});
