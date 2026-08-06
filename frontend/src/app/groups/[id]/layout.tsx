import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { GroupLayoutShell } from "@/components/groups/group-layout-shell";
import { queryKeys } from "@/lib/query-keys";
import { serverApi } from "@/lib/server-api";
import { createServerQueryClient } from "@/lib/server-query-client";
import type { GroupDetailResponse } from "@/lib/types/group";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // O detalhe do clube vem daqui de propósito: o `GroupLayoutShell` segura os
  // filhos atrás do `GroupLayoutSkeleton` enquanto ele carrega. Sem este
  // prefetch, o das páginas de dentro (chat, stats, shelf) chegaria pronto e
  // ficaria escondido até o clube resolver no cliente.
  const queryClient = createServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.groups.detail(id),
      queryFn: () => serverApi.get<GroupDetailResponse>(`/groups/${id}`),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.meetings.badge(id),
      // O hook devolve o booleano, não o envelope — a chave tem que guardar a
      // mesma forma, senão a hidratação entrega um objeto onde o cliente espera
      // `true`/`false`.
      queryFn: () =>
        serverApi
          .get<{ has_upcoming_soon: boolean }>(
            `/groups/${id}/meetings/has-upcoming`,
          )
          .then((json) => json.has_upcoming_soon)
          .catch(() => false),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GroupLayoutShell groupId={id}>{children}</GroupLayoutShell>
    </HydrationBoundary>
  );
}
