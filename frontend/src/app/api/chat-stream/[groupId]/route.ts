import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
/**
 * Edge, e não Node: o stream do backend é um `while True` com ping a cada 5s,
 * feito para viver o tempo todo do chat. Função serverless Node na Vercel tem
 * teto de duração e cortaria a conexão em ciclos, gerando reconexão em
 * cascata; streaming longo é justamente o caso de uso do runtime edge. Nada
 * aqui usa API de Node.
 */
export const runtime = "edge";

/**
 * Proxy manual do SSE do chat — o único caminho da API que não passa pelo
 * rewrite de `next.config.ts`.
 *
 * O rewrite genérico de `/api/v1/:path*` não faz streaming: ele segura o corpo
 * da resposta e só o libera quando a conexão do backend fecha. Para um stream
 * que fica aberto indefinidamente isso significa que o primeiro `event:
 * connected` nunca chega, e com ele morrem mensagem em tempo real, typing
 * indicator e reações alheias (#273).
 *
 * A rota mora fora de `/api/v1` de propósito. Um Route Handler em
 * `/api/v1/groups/[id]/chat/stream` seria o endereço natural, mas perderia: a
 * ordem de resolução do Next checa rewrites de `afterFiles` — onde cai o array
 * que `rewrites()` devolve — *antes* de rotas dinâmicas, então o rewrite casa
 * primeiro e o handler nunca roda. Fora de `/api/v1` não há disputa, e o
 * `[groupId]` continua sendo um segmento de path normal.
 *
 * `request.signal` propaga o `close()` do `EventSource` para o fetch do
 * backend — sem ele, cada chat fechado deixaria uma conexão pendurada lá.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  const { groupId } = await params;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  const upstream = await fetch(
    `${apiUrl}/api/v1/groups/${groupId}/chat/stream`,
    {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      signal: request.signal,
    },
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "text/event-stream",
      // `no-transform` impede que qualquer proxy no caminho recomprima ou
      // bufferize; `x-accel-buffering` é o mesmo pedido, para nginx.
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
