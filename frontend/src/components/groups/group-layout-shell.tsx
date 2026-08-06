"use client";

import { GroupProvider } from "@/lib/contexts/group-context";
import { useGroupDetail } from "@/hooks/use-group-detail";
import { useMeetingsBadge } from "@/hooks/use-meetings-badge";
import { useTimerStore } from "@/stores/use-timer-store";
import { Button } from "@/components/ui/button";
import { FloatingTimerButton } from "@/components/rounds/floating-timer-button";
import { GroupHeader } from "./group-header";
import { GroupTabBar } from "./group-tab-bar";
import { useSkeletonState } from "@/hooks/use-skeleton-state";
import { GroupLayoutSkeleton } from "./group-layout-skeleton";
import { errorMessage } from "@/lib/api";

interface GroupLayoutShellProps {
  groupId: string;
  children: React.ReactNode;
}

export function GroupLayoutShell({ groupId, children }: GroupLayoutShellProps) {
  const { group, isLoading, error, refetch } = useGroupDetail(groupId);
  const showTimer = useTimerStore((s) => s.status !== "idle" || s.roundContext !== null);

  const hasMeetingSoon = useMeetingsBadge(groupId);

  const { showSkeleton } = useSkeletonState(isLoading);
  if (showSkeleton) {
    return <GroupLayoutSkeleton />;
  }
  if (isLoading) return null;

  if (error || !group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-4">
        <p className="text-muted-foreground text-center">
          {error ? errorMessage(error) : "Erro ao carregar grupo."}
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
        <div className="mx-auto w-full max-w-7xl px-4 pt-4">
          <GroupHeader group={group} />
          <GroupTabBar groupId={groupId} variant="desktop" hasMeetingSoon={hasMeetingSoon} />
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 pt-4 pb-20 md:pb-0">
          {children}
        </main>
        <GroupTabBar groupId={groupId} variant="mobile" hasMeetingSoon={hasMeetingSoon} />
        {showTimer && <FloatingTimerButton />}
      </div>
    </GroupProvider>
  );
}
