"use client";

import { useQuery } from "@tanstack/react-query";
import { GroupProvider } from "@/lib/contexts/group-context";
import { useGroupDetail } from "@/hooks/use-group-detail";
import { useTimerStore } from "@/stores/use-timer-store";
import { Button } from "@/components/ui/button";
import { FloatingTimerButton } from "@/components/rounds/floating-timer-button";
import { GroupHeader } from "./group-header";
import { GroupTabBar } from "./group-tab-bar";
import { GroupLayoutSkeleton } from "./group-layout-skeleton";

interface GroupLayoutShellProps {
  groupId: string;
  children: React.ReactNode;
}

export function GroupLayoutShell({ groupId, children }: GroupLayoutShellProps) {
  const { group, loading, error, refetch } = useGroupDetail(groupId);
  const showTimer = useTimerStore((s) => s.status !== "idle" || s.roundContext !== null);

  // Lightweight check — only fetches a boolean, no meeting list or relationships
  const { data: hasUpcomingSoon } = useQuery({
    queryKey: ["meetings-badge", groupId],
    queryFn: async () => {
      const res = await fetch(
        `/api/v1/groups/${groupId}/meetings/has-upcoming`,
        { credentials: "include" },
      );
      if (!res.ok) return false;
      const json = await res.json();
      return json.has_upcoming_soon as boolean;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    enabled: !!groupId,
  });

  if (loading) {
    return <GroupLayoutSkeleton />;
  }

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-muted-foreground text-center">
          {error || "Erro ao carregar grupo."}
        </p>
        <Button type="button" onClick={refetch}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <GroupProvider group={group} refetch={refetch}>
      <div className="flex flex-col min-h-screen">
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 space-y-2">
          <GroupHeader group={group} />
          <GroupTabBar groupId={groupId} variant="desktop" hasMeetingSoon={hasUpcomingSoon ?? false} />
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 pt-4 pb-20 md:pb-0">
          {children}
        </main>
        <GroupTabBar groupId={groupId} variant="mobile" hasMeetingSoon={hasUpcomingSoon ?? false} />
        {showTimer && <FloatingTimerButton />}
      </div>
    </GroupProvider>
  );
}
