"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useGroup } from "@/lib/contexts/group-context";
import { GroupInfoForm } from "./group-info-form";
import { GroupMembersSection } from "./group-members-section";
import { GroupInviteSection } from "./group-invite-section";
import { GroupDangerSection } from "./group-danger-section";

export function GroupSettingsClient() {
  const { group, refetch } = useGroup();
  const isAdmin = group.invite_code !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/groups/${group.id}`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h2 className="text-xl font-semibold">Configurações</h2>
      </div>

      {isAdmin && <GroupInfoForm group={group} refetch={refetch} />}

      <GroupMembersSection group={group} isAdmin={isAdmin} refetch={refetch} />

      {isAdmin && <GroupInviteSection group={group} refetch={refetch} />}

      <GroupDangerSection group={group} isAdmin={isAdmin} />
    </div>
  );
}
