import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useUsernameCheck } from "../use-username-check";

describe("useUsernameCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns idle for empty username", () => {
    const { result } = renderHook(() => useUsernameCheck(""));
    expect(result.current.status).toBe("idle");
  });

  it("returns idle for invalid username format", () => {
    const { result } = renderHook(() => useUsernameCheck("1abc"));
    expect(result.current.status).toBe("idle");
  });

  it("returns idle for username too short", () => {
    const { result } = renderHook(() => useUsernameCheck("ab"));
    expect(result.current.status).toBe("idle");
  });

  it("shows checking immediately for valid username", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ available: true }), { status: 200 })
    );

    const { result } = renderHook(() => useUsernameCheck("validuser"));
    expect(result.current.status).toBe("checking");
  });

  it("returns available when API says available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ available: true }), { status: 200 })
    );

    const { result } = renderHook(() => useUsernameCheck("validuser"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("available");
      },
      { timeout: 2000 },
    );
  });

  it("returns taken when API says not available", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ available: false }), { status: 200 })
    );

    const { result } = renderHook(() => useUsernameCheck("takenuser"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("taken");
      },
      { timeout: 2000 },
    );
  });

  it("returns error on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 500 })
    );

    const { result } = renderHook(() => useUsernameCheck("validuser"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("error");
      },
      { timeout: 2000 },
    );
  });

  it("calls API with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ available: true }), { status: 200 })
    );

    renderHook(() => useUsernameCheck("validuser"));

    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/api/v1/users/check-username/validuser"),
          expect.objectContaining({ credentials: "include" })
        );
      },
      { timeout: 2000 },
    );
  });
});
