import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { ChatContainer } from "@/components/chat/chat-container";
import { queryKeys } from "@/lib/query-keys";
import { serverApi } from "@/lib/server-api";
import { createServerQueryClient } from "@/lib/server-query-client";
import type { MessageListResponse } from "@/lib/types/chat";

export const metadata = { title: "Chat" };

/** O `limit` do `useChatMessages`. Divergir aqui invalidaria o prefetch. */
const PAGE_SIZE = 30;

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  const queryClient = createServerQueryClient();

  // A chave é montada com os mesmos argumentos que a `ChatContainer` passa ao
  // hook: sem `roundId`, e `chapterFilter` no `null` inicial do `chat-store`
  // (que não persiste, então toda primeira renderização começa aqui). Se o
  // usuário filtrar por capítulo, a chave muda e o cliente busca — que é o
  // comportamento certo para um filtro.
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.chat.messages(id, {
      roundId: undefined,
      chapterFilter: null,
    }),
    queryFn: () =>
      serverApi.get<MessageListResponse>(
        `/groups/${id}/messages?limit=${PAGE_SIZE}`,
      ),
    initialPageParam: undefined as string | undefined,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatContainer groupId={id} />
    </HydrationBoundary>
  );
}
