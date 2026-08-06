import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type RenderHookResult, renderHook } from "@testing-library/react";
import { type ReactNode, useState } from "react";

/**
 * `renderHook` com um QueryClient isolado por teste.
 *
 * Os hooks de leitura deixaram de manter `useState` + `useEffect` +
 * `AbortController` à mão e passaram a ser `useQuery`, então precisam de um
 * provider. Um client novo por chamada evita que o cache de um teste responda o
 * seguinte — que é o modo mais chato de um teste passar por engano.
 *
 * `retry: false` porque o default do app tenta uma vez, e esperar o retry só
 * torna o teste lento e intermitente.
 */
export function renderApiHook<Result, Props>(
  render: (initialProps: Props) => Result,
  initialProps?: Props,
): RenderHookResult<Result, Props> {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

  return renderHook(render, {
    initialProps,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

/**
 * Wrapper para `render` de componente que usa hook de query.
 *
 * `useGroupCodeCheck`, `useCurrentRound` e companhia deixaram de manter estado
 * à mão e passaram a ser `useQuery`, então os componentes que os usam precisam
 * de um provider nos testes.
 */
export function QueryWrapper({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
