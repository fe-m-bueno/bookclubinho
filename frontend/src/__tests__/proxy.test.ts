import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

/**
 * Os claims que o backend emite. Solto de propósito nos tipos — os testes de
 * payload malformado precisam justamente emitir o que o backend não emitiria.
 */
interface TestClaims {
  sub?: unknown;
  exp?: unknown;
  onb?: unknown;
}

function encodeJwtPayload(payload: TestClaims | unknown[] | string | number): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.fakesignature`;
}

const FUTURE_EXP = () => Math.floor(Date.now() / 1000) + 3600;

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

    /**
     * `JSON.parse` aceita muito mais do que objeto: `"123"`, `null` e `[1,2]`
     * são JSON válido. Enquanto o payload era lido como `Record<string,
     * unknown>`, cada um deles virava uma "sessão" — `payload.exp` em cima de um
     * número dá `undefined`, a checagem de expiração era pulada, e a requisição
     * seguia para uma rota privada com um token que não é um token.
     */
    it.each([
      ["um número", 123],
      ["uma string", "nem token nem payload"],
      ["um array", [1, 2, 3]],
    ])("redirects to /auth/login when the payload is %s", (_label, payload) => {
      const token = encodeJwtPayload(payload as never);
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
    });

    /**
     * Sem `exp` numérico não há como afirmar que o token está no prazo. Antes a
     * checagem era `typeof exp === "number" && expirou` — a conjunção deixava
     * passar todo token sem `exp`, que é exatamente o token que nunca expira.
     */
    it.each([
      ["missing", undefined],
      ["a string", "9999999999"],
      ["null", null],
    ])("redirects to /auth/login when exp is %s", (_label, exp) => {
      const token = encodeJwtPayload({ sub: "user-1", exp, onb: true });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
    });

    /**
     * O `sub` vira o valor do header `x-user-id`. Um número passava pelo `as
     * string` e chegava ao `headers.set` como número; um valor com `\r\n` é
     * response splitting, e no runtime do Next derruba o `set` — 500 no lugar de
     * um redirect.
     */
    it.each([
      ["um número", 42],
      ["um objeto", { id: "user-1" }],
      ["vazio", ""],
      ["um valor com CRLF", "user-1\r\nx-admin: true"],
    ])("redirects to /auth/login when sub is %s", (_label, sub) => {
      const token = encodeJwtPayload({ sub, exp: FUTURE_EXP(), onb: true });
      const res = proxy(makeRequest("/dashboard", { access_token: token }));
      expect(res.status).toBe(307);
      expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/login");
      expect(res.headers.get("x-user-id")).toBeNull();
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
