import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { StatsClient } from "@/components/stats/stats-client";
import { queryKeys } from "@/lib/query-keys";
import { serverApi } from "@/lib/server-api";
import { createServerQueryClient } from "@/lib/server-query-client";
import type { GroupStatsResponse } from "@/lib/types/stats";
import type { ShelfResponse } from "@/lib/types/shelf";

export const metadata = { title: "Números" };

export default async function StatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // A estante entra junto porque a `StatsClient` monta a `ReadingTimeline` com
  // ela assim que há livros — e é a única leitura da página que não tem
  // skeleton próprio.
  const queryClient = createServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.groups.stats(id),
      queryFn: () => serverApi.get<GroupStatsResponse>(`/groups/${id}/stats`),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.groups.shelf(id),
      queryFn: () => serverApi.get<ShelfResponse>(`/groups/${id}/shelf`),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <StatsClient groupId={id} />
    </HydrationBoundary>
  );
}
