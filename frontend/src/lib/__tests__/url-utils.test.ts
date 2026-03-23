import { describe, it, expect } from "vitest";
import { extractUrls, isValidHttpUrl } from "../url-utils";

describe("isValidHttpUrl", () => {
  it("accepts http URLs", () => {
    expect(isValidHttpUrl("http://example.com")).toBe(true);
  });

  it("accepts https URLs", () => {
    expect(isValidHttpUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("rejects ftp scheme", () => {
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
  });

  it("rejects javascript scheme", () => {
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects plain text", () => {
    expect(isValidHttpUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidHttpUrl("")).toBe(false);
  });
});

describe("extractUrls", () => {
  it("extracts a single URL from plain text", () => {
    expect(extractUrls("Check out https://example.com for details")).toEqual([
      "https://example.com",
    ]);
  });

  it("extracts multiple URLs", () => {
    expect(
      extractUrls("Go to https://one.com and also https://two.com/path")
    ).toEqual(["https://one.com", "https://two.com/path"]);
  });

  it("strips trailing period", () => {
    expect(extractUrls("Visit https://example.com.")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing comma", () => {
    expect(extractUrls("See https://example.com, for more")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing colon", () => {
    expect(extractUrls("Link: https://example.com:")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing semicolon", () => {
    expect(extractUrls("Done https://example.com;")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing exclamation", () => {
    expect(extractUrls("Wow https://example.com!")).toEqual([
      "https://example.com",
    ]);
  });

  it("strips trailing closing paren", () => {
    expect(extractUrls("(see https://example.com)")).toEqual([
      "https://example.com",
    ]);
  });

  it("preserves query params and fragments", () => {
    expect(
      extractUrls("https://example.com/search?q=hello+world&page=2#results")
    ).toEqual(["https://example.com/search?q=hello+world&page=2#results"]);
  });

  it("deduplicates repeated URLs", () => {
    expect(
      extractUrls("https://example.com and https://example.com again")
    ).toEqual(["https://example.com"]);
  });

  it("returns empty array for text without URLs", () => {
    expect(extractUrls("No links here")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractUrls("")).toEqual([]);
  });

  it("ignores non-http schemes", () => {
    expect(extractUrls("ftp://example.com and javascript:alert(1)")).toEqual(
      []
    );
  });

  it("handles URL-only input", () => {
    expect(extractUrls("https://example.com")).toEqual(["https://example.com"]);
  });
});
