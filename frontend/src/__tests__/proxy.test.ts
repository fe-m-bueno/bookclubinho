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

    /**
     * A /about existe para ser aberta por quem ainda não tem conta — é a
     * resposta para quem caiu num convite ou num link de estante e não sabe o
     * que é o app. Pedir login nela seria pedir cadastro antes de explicar.
     */
    it("passes through /about sem sessão", () => {
      const res = proxy(makeRequest("/about"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through /about mesmo com onboarding pendente", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: false,
      });
      const res = proxy(makeRequest("/about", { access_token: token }));
      expect(res.headers.get("Location")).toBeNull();
    });

    /**
     * O cartão do link e o ícone da aba são pedidos por quem nunca terá
     * cookie: o crawler do WhatsApp, do Slack, do X. Um 307 para o login no
     * lugar do PNG deixa o cartão quebrado em toda parte onde o link circular.
     */
    it.each([
      "/opengraph-image",
      "/twitter-image",
      "/icon",
      "/apple-icon",
      "/favicon.ico",
      "/icon.svg",
    ])("passes through %s sem sessão", (rota) => {
      const res = proxy(makeRequest(rota));
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

  describe("root route", () => {
    it("passes through / when there is no token (landing page)", () => {
      const res = proxy(makeRequest("/"));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through / when the token is garbage (landing page)", () => {
      const res = proxy(makeRequest("/", { access_token: "garbage" }));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("passes through / when the token is expired (landing page)", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) - 3600,
        onb: false,
      });
      const res = proxy(makeRequest("/", { access_token: token }));
      expect(res.headers.get("Location")).toBeNull();
    });

    it("redirects / to /onboarding when onb is false", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: false,
      });
      const res = proxy(makeRequest("/", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/onboarding");
    });

    it("redirects / to /onboarding when the onb claim is missing", () => {
      const token = encodeJwtPayload({
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const res = proxy(makeRequest("/", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/onboarding");
    });

    it("passes through / and sets x-user-id when onb is true", () => {
      const token = encodeJwtPayload({
        sub: "user-42",
        exp: Math.floor(Date.now() / 1000) + 3600,
        onb: true,
      });
      const res = proxy(makeRequest("/", { access_token: token }));
      expect(res.headers.get("Location")).toBeNull();
      expect(res.headers.get("x-user-id")).toBe("user-42");
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
