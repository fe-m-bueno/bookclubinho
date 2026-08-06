import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, UnauthorizedError, api } from "@/lib/api";

vi.mock("@/lib/csrf", () => ({
  ensureCsrf: vi.fn(async () => {}),
  withCsrf: vi.fn((h: Record<string, string> = {}) => ({
    ...h,
    "X-CSRF-Token": "tok",
  })),
}));

import { ensureCsrf, withCsrf } from "@/lib/csrf";

function ok(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function lastCall() {
  const mock = global.fetch as unknown as ReturnType<typeof vi.fn>;
  return mock.mock.calls.at(-1) as [string, RequestInit];
}

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => ok()) as unknown as typeof fetch;
});

describe("prefixo e credenciais", () => {
  it("prefixa /api/v1 — o call site passa só o caminho", async () => {
    await api.get("/groups");
    expect(lastCall()[0]).toBe("/api/v1/groups");
  });

  it("sempre envia credenciais, que eram obrigação de cada caller", async () => {
    await api.get("/groups");
    expect(lastCall()[1].credentials).toBe("include");
  });
});

describe("CSRF é decidido pelo método", () => {
  it("GET não semeia nem envia token", async () => {
    await api.get("/groups");
    expect(ensureCsrf).not.toHaveBeenCalled();
    expect(withCsrf).not.toHaveBeenCalled();
  });

  it.each(["post", "patch", "put", "del"] as const)(
    "%s semeia o cookie e envia o header",
    async (method) => {
      await api[method]("/groups", { a: 1 });
      expect(ensureCsrf).toHaveBeenCalledOnce();
      const headers = lastCall()[1].headers as Record<string, string>;
      expect(headers["X-CSRF-Token"]).toBe("tok");
    },
  );
});

describe("codificação do corpo", () => {
  it("objeto simples vira JSON com Content-Type", async () => {
    await api.post("/groups", { name: "Clube" });
    const [, init] = lastCall();
    expect(init.body).toBe('{"name":"Clube"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
  });

  it("FormData passa intacto e sem Content-Type", async () => {
    // Definir Content-Type à mão aqui quebra o upload: o browser precisa
    // montar o boundary do multipart.
    const fd = new FormData();
    fd.append("name", "Clube");
    await api.post("/groups", fd);
    const [, init] = lastCall();
    expect(init.body).toBe(fd);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("URLSearchParams passa intacto e sem Content-Type", async () => {
    // O login manda form-encoded; o browser define o header sozinho. O
    // FORM_HEADERS que o call site passava era redundante.
    const params = new URLSearchParams({ username: "a@b.c", password: "x" });
    await api.post("/auth/login", params);
    const [, init] = lastCall();
    expect(init.body).toBe(params);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("sem corpo, não manda body", async () => {
    await api.del("/messages/1");
    expect(lastCall()[1].body).toBeUndefined();
  });
});

describe("erros carregam a mensagem do backend", () => {
  it("extrai detail — o apiFetch antigo descartava", async () => {
    global.fetch = vi.fn(async () =>
      ok({ detail: "Este clube está cheio." }, 403),
    ) as unknown as typeof fetch;

    await expect(api.post("/groups/join", {})).rejects.toMatchObject({
      status: 403,
      detail: "Este clube está cheio.",
      message: "Este clube está cheio.",
    });
  });

  it("extrai a primeira msg do detail de validação do FastAPI", async () => {
    global.fetch = vi.fn(async () =>
      ok({ detail: [{ msg: "String should have at least 2 characters" }] }, 422),
    ) as unknown as typeof fetch;

    await expect(api.post("/groups", {})).rejects.toMatchObject({
      status: 422,
      detail: "String should have at least 2 characters",
    });
  });

  it("corpo não-JSON não quebra o unwrap", async () => {
    global.fetch = vi.fn(
      async () => new Response("<html>502</html>", { status: 502 }),
    ) as unknown as typeof fetch;

    const err = (await api.get("/groups").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
  });

  it("401 é um tipo próprio, para o redirect acontecer num lugar só", async () => {
    global.fetch = vi.fn(async () =>
      ok({ detail: "Não autenticado." }, 401),
    ) as unknown as typeof fetch;

    const err = (await api.get("/users/me").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(UnauthorizedError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
  });
});

describe("respostas sem corpo", () => {
  it("204 devolve undefined em vez de estourar no JSON.parse", async () => {
    global.fetch = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;

    await expect(api.del("/messages/1")).resolves.toBeUndefined();
  });

  it("200 com corpo vazio também", async () => {
    global.fetch = vi.fn(
      async () => new Response("", { status: 200 }),
    ) as unknown as typeof fetch;

    await expect(api.get("/whatever")).resolves.toBeUndefined();
  });
});

/**
 * Abortar no unmount não é motivo para sair do cliente e voltar ao `fetch` cru
 * — era o que três leituras faziam só por causa do `signal`.
 */
describe("abort", () => {
  it("repassa o signal para o fetch", async () => {
    const controller = new AbortController();
    await api.get("/books/dom-casmurro", { signal: controller.signal });
    expect(lastCall()[1].signal).toBe(controller.signal);
  });

  it("sem signal o campo fica undefined, não um signal já abortado", async () => {
    await api.get("/books/dom-casmurro");
    expect(lastCall()[1].signal).toBeUndefined();
  });

  it("o abort chega como AbortError e não como ApiError", async () => {
    const controller = new AbortController();
    global.fetch = vi.fn(async (_url, init?: RequestInit) => {
      controller.abort();
      throw Object.assign(new Error("aborted"), {
        name: "AbortError",
        signal: init?.signal,
      });
    }) as unknown as typeof fetch;

    // Quem trata precisa dessa diferença: "o servidor respondeu erro" pede
    // uma ação; "desisti da requisição" não pede nada.
    await expect(
      api.get("/books/x", { signal: controller.signal }),
    ).rejects.not.toBeInstanceOf(ApiError);
  });
});
