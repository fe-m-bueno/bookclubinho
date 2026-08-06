"use client";

/**
 * O cliente HTTP do app.
 *
 * Antes disto havia três transportes: `apiFetch` (usado por 10 de 36 hooks),
 * `fetch` cru (21 hooks), e `XMLHttpRequest` para upload com progresso. Cada
 * call site recopiava as mesmas obrigações — `credentials: "include"`, o prefixo
 * `/api/v1`, `ensureCsrf()` antes de mutar, `withCsrf(headers)`, o redirect no
 * 401, e o idioma `res.json().catch(() => ({})).detail` para extrair a mensagem
 * de erro. Nada disso era verificado por tipo; era convenção por cópia.
 *
 * Duas coisas mudam de fato:
 *
 * **O método determina o CSRF.** `post`/`patch`/`del` cuidam disso; esquecer
 * deixa de ser possível por aqui.
 *
 * **O erro do backend chega à UI.** O `apiFetch` antigo descartava o
 * `{"detail": "..."}` e lançava `Erro ao carregar dados (500)`. Agora a mensagem
 * real vem em `ApiError.detail`.
 *
 * Fora daqui, de propósito: `use-chat-sse.ts` (EventSource) e
 * `use-media-upload.ts` (XHR, precisa de evento de progresso). São transportes
 * diferentes por necessidade.
 */

import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { ApiError, UnauthorizedError, readError } from "@/lib/api-error";

const PREFIX = "/api/v1";

// As classes de erro moram em `api-error.ts` — um módulo neutro, que o
// `serverApi` também importa. Reexportadas daqui porque `@/lib/api` é onde os
// call sites já as procuram.
export { ApiError, UnauthorizedError };

// `object` e não `Record<string, unknown>`: uma interface declarada não tem
// index signature, então não é atribuível ao Record e todo caller precisaria de
// cast.
type Body = BodyInit | object | null | undefined;

/**
 * `FormData` e `URLSearchParams` trazem o próprio Content-Type (com boundary, no
 * caso do FormData) — defini-lo à mão quebra o upload. Só objeto simples vira
 * JSON.
 */
function encode(body: Body): { body?: BodyInit; headers: Record<string, string> } {
  if (body === undefined || body === null) return { headers: {} };
  if (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer
  ) {
    return { body: body as BodyInit, headers: {} };
  }
  return {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  };
}

/**
 * Um `AbortSignal` para as leituras que precisam parar no unmount. Existe para
 * que esses casos não precisem de um `fetch` cru só por causa do `signal` —
 * abortar não é motivo para sair do cliente. O abort chega como `AbortError`,
 * que não é `ApiError`: quem trata distingue "o servidor respondeu erro" de
 * "desisti da requisição".
 */
interface RequestInit_ {
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  body?: Body,
  init?: RequestInit_,
): Promise<T> {
  const mutating = method !== "GET";
  if (mutating) await ensureCsrf();

  const encoded = encode(body);
  const res = await fetch(`${PREFIX}${path}`, {
    method,
    credentials: "include",
    headers: mutating ? withCsrf(encoded.headers) : encoded.headers,
    body: encoded.body,
    signal: init?.signal,
  });

  if (res.status === 401) throw new UnauthorizedError(await readError(res));
  if (!res.ok) throw new ApiError(res.status, await readError(res));

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Para respostas que não são JSON — hoje só o `.ics` do calendário. Existe para
 * que esse caso não precise de um `fetch` cru que lembre do CSRF sozinho.
 */
async function requestBlob(method: string, path: string): Promise<Blob> {
  if (method !== "GET") await ensureCsrf();
  const res = await fetch(`${PREFIX}${path}`, {
    method,
    credentials: "include",
    headers: method !== "GET" ? withCsrf({}) : {},
  });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return res.blob();
}

export const api = {
  get: <T>(path: string, init?: RequestInit_) =>
    request<T>("GET", path, undefined, init),
  blob: (path: string, method = "POST") => requestBlob(method, path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
};
