import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesignature`;
}

function makeRequest(path: string, cookies?: Record<string, string>): NextRequest {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url);
  if (cookies) {
    for (const [key, value] of Object.entries(cookies)) {
      req.cookies.set(key, value);
    }
  }
  return req;
}

describe("middleware", () => {
  describe("public/skipped routes", () => {
    it("passes through /auth/login", () => {
      const res = proxy(makeRequest("/auth/login"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through /auth/register", () => {
      const res = proxy(makeRequest("/auth/register"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through /shelf/some-id", () => {
      const res = proxy(makeRequest("/shelf/some-id"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through /api/v1/auth/login", () => {
      const res = proxy(makeRequest("/api/v1/auth/login"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through /_next/static/chunk.js", () => {
      const res = proxy(makeRequest("/_next/static/chunk.js"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through static files", () => {
      const res = proxy(makeRequest("/logo.png"));
      expect(res.headers.get("Location")).toBeNull();
    });
  });

  describe("unauthenticated", () => {
    it("redirects to /auth/login when no token", () => {
      const res = proxy(makeRequest("/dashboard"));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
    });

    it("redirects to /auth/login when token is invalid", () => {
      const res = proxy(makeRequest("/dashboard", { access_token: "garbage" }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
    });

    it("redirects to /auth/login when token is expired", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) - 3600,
        onb: true,
      });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
    });
  });

  describe("onboarding redirect", () => {
    it("redirects to /onboarding when onb is false", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: false,
      });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/onboarding");
    });

    it("allows access to /onboarding when onb is false", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: false,
      });
      const res = proxy(makeRequest("/onboarding", { access_token: token }));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("redirects from /onboarding to / when onb is true", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: true,
      });
      const res = proxy(makeRequest("/onboarding", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/");
    });

    it("redirects from /onboarding/step-2 to / when onb is true", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: true,
      });
      const res = proxy(makeRequest("/onboarding/step-2", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/");
    });
  });

  describe("authenticated passthrough", () => {
    it("passes through and sets x-user-id header", () => {
      const token = encodeJwtPayload({
        sub: "user-42",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: true,
      });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("x-user-id")).toBe("user-42");
    });

    it("handles missing onb claim as false", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/onboarding");
    });
  });
});
