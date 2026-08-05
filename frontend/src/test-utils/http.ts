/**
 * Respostas HTTP de verdade para os testes.
 *
 * O padrão anterior era um objeto literal com só os campos que o código de
 * então usava — `ok` e `json` — marcado com `as Response`. Quando `lib/api`
 * passou a ler `status` e `text()` (para tolerar corpo vazio em 204), esses
 * dublês quebraram, e a falha aparecia como "onSuccess não foi chamado" em vez
 * de "o mock não é uma Response".
 *
 * Um Response de verdade não tem esse problema, e vale para qualquer transporte.
 *
 * **O corpo de um Response só pode ser lido uma vez.** Com `mockResolvedValue`
 * a mesma instância volta em toda chamada, e da segunda em diante o corpo chega
 * vazio — o sintoma é uma lista que vem com zero itens sem erro nenhum. Para
 * mais de uma chamada use `mockImplementation(async () => jsonResponse(...))`,
 * que cria uma resposta nova a cada vez.
 */

/** Status que a spec proíbe de ter corpo — `new Response(body, {status})` lança. */
const BODYLESS = new Set([101, 103, 204, 205, 304]);

export function jsonResponse(body: unknown, status = 200): Response {
  if (BODYLESS.has(status)) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, detail: string): Response {
  return jsonResponse({ detail }, status);
}

export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}
