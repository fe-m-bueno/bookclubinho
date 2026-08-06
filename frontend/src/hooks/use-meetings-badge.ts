"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * O clube tem encontro nas próximas 48h? — só o booleano, sem lista nem
 * relacionamentos.
 *
 * Estava embutido em `group-layout-shell.tsx` com `fetch` cru e a key declarada
 * inline, enquanto `use-meeting-mutations.ts` a invalidava por string literal de
 * outro arquivo. A key agora vem do módulo, e quem responde a pergunta é o
 * backend: `use-meetings.ts` recalculava o mesmo conceito no cliente com uma
 * janela de 48h escrita à mão, sem consumidor e sem garantia de concordar com o
 * limite do servidor.
 */
export function useMeetingsBadge(groupId: string) {
  const { data } = useQuery({
    queryKey: queryKeys.meetings.badge(groupId),
    queryFn: () =>
      api
        .get<{ has_upcoming_soon: boolean }>(
          `/groups/${groupId}/meetings/has-upcoming`,
        )
        .then((json) => json.has_upcoming_soon)
        // Badge é enfeite: falhar em silêncio é melhor que derrubar o layout.
        .catch(() => false),
    staleTime: 5 * 60 * 1000, // 5 min
    enabled: !!groupId,
  });

  return data ?? false;
}
