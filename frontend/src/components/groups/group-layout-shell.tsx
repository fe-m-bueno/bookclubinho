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
      {/* `h-dvh` e não `min-h-screen`: o grupo é uma pilha de altura fixa e quem
          rola é o `main`. Com altura indefinida no topo não há espaço a
          dividir, e um filho `flex-1` cresce com o conteúdo — o chat empurrava
          o campo de escrever para baixo da dobra. `dvh` porque a barra de URL
          do mobile muda a altura visível. */}
      <div className="flex h-dvh flex-col">
        <div className="mx-auto w-full max-w-7xl px-4 pt-4">
          <GroupHeader group={group} />
          <GroupTabBar groupId={groupId} variant="desktop" hasMeetingSoon={hasMeetingSoon} />
        </div>
        {/* O controle segmentado mora dentro da área rolável, não acima dela:
            é o que o faz sair de cena em Estante, Números e Encontros e seguir
            à vista no chat, que não rola. Sem `pb-20` — não existe mais barra
            fixa no rodapé para compensar. */}
        {/* `min-h-0` importa: sem ele um filho `flex-1` cresce com o conteúdo e
            empurra a página em vez de rolar dentro do main — o chat perdia o
            campo de escrever para baixo da dobra. */}
        <main className="mx-auto flex w-full min-h-0 max-w-7xl flex-1 flex-col overflow-y-auto px-4 pt-4 pb-[env(safe-area-inset-bottom)]">
          <GroupTabBar
            groupId={groupId}
            variant="mobile"
            hasMeetingSoon={hasMeetingSoon}
          />
          <div className="flex min-h-0 flex-1 flex-col pt-3 md:pt-0">
            {children}
          </div>
        </main>
        {showTimer && <FloatingTimerButton />}
      </div>
    </GroupProvider>
  );
}
