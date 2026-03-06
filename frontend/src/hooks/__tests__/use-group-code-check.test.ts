import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useGroupCodeCheck } from "../use-group-code-check";

describe("useGroupCodeCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns idle for empty code", () => {
    const { result } = renderHook(() => useGroupCodeCheck(""));
    expect(result.current.status).toBe("idle");
    expect(result.current.group).toBeNull();
  });

  it("returns idle for code too short", () => {
    const { result } = renderHook(() => useGroupCodeCheck("ABCD"));
    expect(result.current.status).toBe("idle");
  });

  it("returns idle for invalid characters (0, 1, I, L, O)", () => {
    const { result } = renderHook(() => useGroupCodeCheck("ABCD0001"));
    expect(result.current.status).toBe("idle");
  });

  it("shows checking immediately for valid 8-char code", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: "Clube", photo_url: null, member_count: 3 }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => useGroupCodeCheck("ABCD2345"));
    expect(result.current.status).toBe("checking");
  });

  it("returns valid with group data on 200", async () => {
    const groupData = { name: "Clube Literário", photo_url: null, member_count: 5 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(groupData), { status: 200 }),
    );

    const { result } = renderHook(() => useGroupCodeCheck("ABCD2345"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("valid");
      },
      { timeout: 2000 },
    );
    expect(result.current.group).toEqual(groupData);
  });

  it("returns not_found on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Not found" }), { status: 404 }),
    );

    const { result } = renderHook(() => useGroupCodeCheck("ZZZZZZZZ"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("not_found");
      },
      { timeout: 2000 },
    );
    expect(result.current.group).toBeNull();
  });

  it("returns error on network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useGroupCodeCheck("ABCD2345"));

    await waitFor(
      () => {
        expect(result.current.status).toBe("error");
      },
      { timeout: 2000 },
    );
    expect(result.current.group).toBeNull();
  });

  it("calls API with credentials include", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ name: "Clube", photo_url: null, member_count: 1 }),
        { status: 200 },
      ),
    );

    renderHook(() => useGroupCodeCheck("ABCD2345"));

    await waitFor(
      () => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("/api/v1/groups/validate/ABCD2345"),
          expect.objectContaining({ credentials: "include" }),
        );
      },
      { timeout: 2000 },
    );
  });
});
