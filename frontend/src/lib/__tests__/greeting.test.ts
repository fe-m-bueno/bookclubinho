import { describe, it, expect, vi, afterEach } from "vitest";
import { getGreeting } from "../greeting";

// America/Sao_Paulo is UTC-3 (Brazil abolished DST in 2019)
// UTC offset: SP = UTC - 3h
describe("getGreeting", () => {
  const timezone = "America/Sao_Paulo";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Bom dia' for morning hours (9h)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z")); // 12:00 UTC = 09:00 SP
    expect(getGreeting(timezone)).toBe("Bom dia");
  });

  it("returns 'Boa tarde' for afternoon hours (15h)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T18:00:00Z")); // 18:00 UTC = 15:00 SP
    expect(getGreeting(timezone)).toBe("Boa tarde");
  });

  it("returns 'Boa noite' for evening hours (20h)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T23:00:00Z")); // 23:00 UTC = 20:00 SP
    expect(getGreeting(timezone)).toBe("Boa noite");
  });

  it("returns 'Boa noite' for late night hours (2h)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T05:00:00Z")); // 05:00 UTC = 02:00 SP
    expect(getGreeting(timezone)).toBe("Boa noite");
  });

  it("returns 'Bom dia' at boundary hour 5", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T08:00:00Z")); // 08:00 UTC = 05:00 SP
    expect(getGreeting(timezone)).toBe("Bom dia");
  });

  it("returns 'Boa tarde' at boundary hour 12", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T15:00:00Z")); // 15:00 UTC = 12:00 SP
    expect(getGreeting(timezone)).toBe("Boa tarde");
  });

  it("returns fallback for invalid timezone", () => {
    const result = getGreeting("Invalid/Timezone");
    expect(["Bom dia", "Boa tarde", "Boa noite"]).toContain(result);
  });
});
