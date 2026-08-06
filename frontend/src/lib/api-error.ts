/**
 * O erro da API, e como extraí-lo de uma resposta.
 *
 * Estava dentro de `api.ts`, que é `"use client"`. Um módulo `"use client"` não
 * exporta valores para o servidor — o que chega lá é uma referência de cliente,
 * não a classe. Como `server-api.ts` precisa lançar o *mesmo* `ApiError` (senão
 * `instanceof` passa a depender de qual transporte fez a requisição), as duas
 * classes e o `readError` vivem aqui, num módulo neutro que os dois importam.
 *
 * `api.ts` reexporta ambas, então os 20 arquivos que fazem
 * `import { ApiError } from "@/lib/api"` continuam iguais.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * 401. Lançado, não tratado aqui: quem decide o redirect é o `Providers`, num
 * lugar só. O cliente antigo recebia um `router` e navegava, o que obrigava todo
 * caller a carregar um — era a razão de existir do `useRouterRef`.
 */
export class UnauthorizedError extends ApiError {
  constructor(detail = "Não autenticado") {
    super(401, detail);
    this.name = "UnauthorizedError";
  }
}

export async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { detail?: unknown };
    if (typeof data?.detail === "string") return data.detail;
    // 422 do FastAPI: detail é uma lista de erros de validação
    if (Array.isArray(data?.detail)) {
      const first = data.detail[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  } catch {
    // corpo vazio ou não-JSON
  }
  return `Erro ao processar a requisição (${res.status})`;
}
