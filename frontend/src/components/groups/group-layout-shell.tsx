"use client";

import { GroupProvider } from "@/lib/contexts/group-context";
import { useGroupDetail } from "@/hooks/use-group-detail";
import { Button } from "@/components/ui/button";
import { GroupHeader } from "./group-header";
import { GroupTabBar } from "./group-tab-bar";
import { GroupLayoutSkeleton } from "./group-layout-skeleton";

interface GroupLayoutShellProps {
  groupId: string;
  children: React.ReactNode;
}

export function GroupLayoutShell({ groupId, children }: GroupLayoutShellProps) {
  const { group, loading, error, refetch } = useGroupDetail(groupId);

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
        <div className="px-4 pt-4">
          <GroupHeader group={group} />
        </div>
        <GroupTabBar groupId={groupId} variant="desktop" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
        <GroupTabBar groupId={groupId} variant="mobile" />
      </div>
    </GroupProvider>
  );
}
