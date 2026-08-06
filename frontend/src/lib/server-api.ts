import { cookies } from "next/headers";

import { ApiError, UnauthorizedError, readError } from "@/lib/api-error";

/**
 * O mesmo transporte do `api.ts`, do lado do servidor.
 *
 * `api.ts` é `"use client"` e não roda aqui, por duas razões concretas:
 * `credentials: "include"` não existe fora do browser, e o caminho relativo
 * `/api/v1/...` depende do rewrite do `next.config.ts` — no servidor não há
 * origem para resolver contra. Então este módulo repassa o cookie à mão, via
 * `cookies()`, e fala direto com o backend pela URL absoluta.
 *
 * Só `GET`. Server Component não muta nada, então não há CSRF a considerar —
 * o que também evita que este módulo vire uma porta de escrita sem o
 * double-submit cookie do lado do cliente.
 *
 * Falhar aqui é aceitável de propósito: quem chama é `prefetchQuery`, que
 * engole o erro e deixa a query fora do `dehydrate`. O hook do cliente então
 * busca como sempre buscou, com skeleton. O prefetch é aceleração, nunca
 * requisito.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const PREFIX = "/api/v1";

interface ServerRequestOptions {
  /**
   * Repassa o cookie da requisição atual. `false` para rotas públicas — sem
   * isso a resposta variaria por usuário e não poderia ser cacheada.
   */
  auth?: boolean;
  /** Cache do Next. Só faz sentido com `auth: false`. */
  next?: NextFetchRequestConfig;
}

async function authHeaders(): Promise<Record<string, string>> {
  // `cookies()` marca a rota como dinâmica — correto: a resposta depende de
  // quem pediu. `toString()` devolve o header `Cookie` já montado.
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
}

async function serverGet<T>(
  /** Caminho sem `/api/v1`, igual ao `api.get`. */
  path: string,
  options: ServerRequestOptions = {},
): Promise<T> {
  const { auth = true, next } = options;

  const res = await fetch(`${BASE_URL}${PREFIX}${path}`, {
    headers: auth ? await authHeaders() : {},
    ...(next ? { next } : {}),
  });

  if (res.status === 401) throw new UnauthorizedError(await readError(res));
  if (!res.ok) throw new ApiError(res.status, await readError(res));

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const serverApi = {
  get: serverGet,
};
