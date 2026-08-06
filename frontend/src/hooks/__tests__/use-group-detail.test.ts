import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useGroupDetail } from "@/hooks/use-group-detail";
import { renderApiHook } from "@/test-utils/query";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { get: vi.fn() } };
});

import { api } from "@/lib/api";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("useGroupDetail", () => {
  it("expõe o grupo em `group`, não em `data`", async () => {
    const group = { id: "g1", name: "Clube" };
    get.mockResolvedValue(group);

    const { result } = renderApiHook(() => useGroupDetail("g1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(get).toHaveBeenCalledWith("/groups/g1");
    expect(result.current.group).toEqual(group);
  });
});
