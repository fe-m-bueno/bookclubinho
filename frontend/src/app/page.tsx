import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { HomeClient } from "@/components/home/home-client";
import { LandingPage } from "@/components/landing/landing-page";
import { queryKeys } from "@/lib/query-keys";
import { serverApi } from "@/lib/server-api";
import { createServerQueryClient } from "@/lib/server-query-client";
import type { UserMe } from "@/lib/types/user";
import type { GroupListResponse } from "@/lib/types/group";
import type { UpcomingMeetingsResponse } from "@/lib/types/meeting";
import type { RecentBadgesResponse } from "@/lib/types/badge";

export const metadata: Metadata = {
  title: "Bookclubinho",
};

/** O `useUpcomingMeetings(3)` / `useRecentBadges(3)` da `HomeClient`. */
const HOME_LIMIT = 3;

export default async function HomePage() {
  const cookieStore = await cookies();
  const isAuthenticated = cookieStore.has("access_token");

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  // As quatro leituras da home, no servidor, em paralelo. As chaves são as
  // mesmas que os hooks usam — é o que faz a `HomeClient` encontrar o dado no
  // cache e não buscar. Nenhum componente cliente muda por causa disto.
  const queryClient = createServerQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.user.me(),
      queryFn: () => serverApi.get<UserMe>("/users/me"),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.groups.home(),
      queryFn: () => serverApi.get<GroupListResponse>("/groups/"),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.meetings.upcoming(HOME_LIMIT),
      queryFn: () =>
        serverApi.get<UpcomingMeetingsResponse>(
          `/meetings/upcoming?limit=${HOME_LIMIT}`,
        ),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.badges.recent(HOME_LIMIT),
      queryFn: () =>
        serverApi.get<RecentBadgesResponse>(
          `/users/me/badges/recent?limit=${HOME_LIMIT}`,
        ),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeClient />
    </HydrationBoundary>
  );
}
