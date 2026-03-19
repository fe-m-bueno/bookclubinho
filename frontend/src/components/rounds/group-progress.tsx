"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberSummary } from "@/lib/types/group";
import type { MemberProgressSummary } from "@/lib/types/round";

interface GroupProgressProps {
  members: MemberSummary[];
  progress: MemberProgressSummary[] | null;
  loading: boolean;
}

export function GroupProgress({ members, progress, loading }: GroupProgressProps) {
  const rows = useMemo(() => {
    if (!progress) return [];
    return members
      .map((member) => {
        const memberProgress = progress.find(
          (p) => p.user_id === member.user_id,
        );
        return {
          member,
          percentage: memberProgress?.percentage ?? 0,
          is_finished: memberProgress?.is_finished ?? false,
          current_page: memberProgress?.current_page ?? null,
        };
      })
      .sort((a, b) => {
        if (a.is_finished && !b.is_finished) return -1;
        if (!a.is_finished && b.is_finished) return 1;
        return b.percentage - a.percentage;
      });
  }, [progress, members]);

  const displayName = (member: MemberSummary) =>
    member.display_name ?? member.username ?? "Membro";

  const initials = (member: MemberSummary) =>
    displayName(member).slice(0, 2).toUpperCase();

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">
        Progresso do Grupo
      </h2>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <Skeleton className="h-4 w-8 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(({ member, percentage, is_finished }, index) => (
            <motion.div
              key={member.user_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index, duration: 0.2 }}
              className="flex items-center gap-3"
            >
              <Avatar size="sm">
                {member.avatar_url && (
                  <AvatarImage
                    src={member.avatar_url}
                    alt={displayName(member)}
                  />
                )}
                <AvatarFallback>{initials(member)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-sm font-medium text-foreground truncate leading-none">
                  {displayName(member)}
                </p>
                <Progress value={percentage} className="h-1.5" />
              </div>

              <div className="shrink-0 flex items-center gap-1.5">
                {is_finished ? (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-xs py-0.5 px-1.5"
                  >
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    Terminou!
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground w-10 text-right">
                    {percentage}%
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
