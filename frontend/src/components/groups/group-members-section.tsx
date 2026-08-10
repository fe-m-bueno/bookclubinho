"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Shield, ShieldOff, UserMinus } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, errorMessage } from "@/lib/api";
import type { GroupDetailResponse, MemberSummary } from "@/lib/types/group";

interface GroupMembersSectionProps {
  group: GroupDetailResponse;
  isAdmin: boolean;
  refetch: () => void;
}

type MemberAction = "promote" | "demote" | "remove";

type ConfirmingAction = {
  userId: string;
  action: MemberAction;
} | null;

export function GroupMembersSection({
  group,
  isAdmin,
  refetch,
}: GroupMembersSectionProps) {
  const [confirming, setConfirming] = useState<ConfirmingAction>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleRoleChange = useCallback(
    async (member: MemberSummary, newRole: "admin" | "member") => {
      setActionLoading(true);
      try {
        await api.patch(`/groups/${group.id}/members/${member.user_id}`, {
          role: newRole,
        });
        toast.success(
          newRole === "admin" ? "Membro promovido!" : "Membro rebaixado!",
        );
        refetch();
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setActionLoading(false);
        setConfirming(null);
      }
    },
    [group.id, refetch],
  );

  const handleRemove = useCallback(
    async (member: MemberSummary) => {
      setActionLoading(true);
      try {
        await api.del(`/groups/${group.id}/members/${member.user_id}`);
        toast.success("Membro removido!");
        refetch();
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setActionLoading(false);
        setConfirming(null);
      }
    },
    [group.id, refetch],
  );

  const isConfirmingAction = (userId: string, action: MemberAction) =>
    confirming?.userId === userId && confirming?.action === action;

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-4">
      <h3 className="font-semibold">
        Membros ({group.member_count}/{group.max_members})
      </h3>

      <ul className="space-y-3">
        {group.members.map((member) => {
          const isCurrentUser = member.user_id === group.current_user_id;
          const isMemberAdmin = member.role === "admin";
          const displayName =
            member.display_name || member.username || "Usuário";
          const initial = displayName.charAt(0).toUpperCase();

          return (
            <li
              key={member.user_id}
              className="flex items-center gap-3"
            >
              <Avatar size="sm">
                {member.avatar_url && (
                  <AvatarImage src={member.avatar_url} alt={displayName} />
                )}
                <AvatarFallback className="bg-sage-100 text-sage-700 text-xs font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="type-body truncate font-medium">
                    {displayName}
                  </span>
                  {isCurrentUser && (
                    <span className="type-micro">(Você)</span>
                  )}
                </div>
                <Badge
                  variant={isMemberAdmin ? "default" : "secondary"}
                  className="type-micro px-1.5 py-0 text-inherit"
                >
                  {isMemberAdmin ? "Admin" : "Membro"}
                </Badge>
              </div>

              {isAdmin && !isCurrentUser && (
                <div className="flex items-center gap-1 shrink-0">
                  {/* Role toggle */}
                  {isConfirmingAction(
                    member.user_id,
                    isMemberAdmin ? "demote" : "promote",
                  ) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading}
                      onClick={() =>
                        handleRoleChange(
                          member,
                          isMemberAdmin ? "member" : "admin",
                        )
                      }
                      className="type-micro h-7 text-inherit"
                    >
                      Confirmar?
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirming({
                          userId: member.user_id,
                          action:
                            isMemberAdmin ? "demote" : "promote",
                        })
                      }
                      className="h-7 w-7 p-0"
                      aria-label={
                        isMemberAdmin
                          ? "Rebaixar membro"
                          : "Promover a admin"
                      }
                    >
                      {isMemberAdmin ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <Shield className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}

                  {/* Remove */}
                  {isConfirmingAction(member.user_id, "remove") ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={actionLoading}
                      onClick={() => handleRemove(member)}
                      className="type-micro h-7 text-inherit"
                    >
                      Confirmar?
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirming({
                          userId: member.user_id,
                          action: "remove",
                        })
                      }
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      aria-label="Remover membro"
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
