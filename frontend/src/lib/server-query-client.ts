import { QueryClient } from "@tanstack/react-query";

/**
 * O QueryClient de uma requisição no servidor.
 *
 * Novo a cada chamada, sempre: um client compartilhado entre requisições
 * vazaria o cache de um usuário para outro. O do browser continua sendo o do
 * `Providers`, criado uma vez por sessão.
 *
 * `retry: false` porque prefetch é aceleração: se o backend falhou, insistir só
 * atrasa o HTML. A query fica de fora do `dehydrate` (que descarta as que
 * terminaram em erro) e o hook do cliente busca normalmente, com skeleton.
 */
export function createServerQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: false,
      },
    },
  });
}
