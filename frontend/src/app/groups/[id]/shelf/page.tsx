import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { ShelfClient } from "@/components/shelf/shelf-client";
import { queryKeys } from "@/lib/query-keys";
import { serverApi } from "@/lib/server-api";
import { createServerQueryClient } from "@/lib/server-query-client";
import type { ShelfResponse } from "@/lib/types/shelf";

export const metadata = { title: "Estante" };

export default async function ShelfPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // A `ShelfClient` tira o id do contexto do clube; a página precisa dele para
  // montar a chave, e o `params` já estava disponível — só não era lido.
  const { id } = await params;

  const queryClient = createServerQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.groups.shelf(id),
    queryFn: () => serverApi.get<ShelfResponse>(`/groups/${id}/shelf`),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ShelfClient />
    </HydrationBoundary>
  );
}
