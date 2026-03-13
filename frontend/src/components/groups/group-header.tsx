"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { MemberAvatarStack } from "./member-avatar-stack";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupHeaderProps {
  group: GroupDetailResponse;
}

export function GroupHeader({ group }: GroupHeaderProps) {
  const isAdmin = group.invite_code !== null;
  const initial = group.name.charAt(0).toUpperCase();

  return (
    <header className="bg-card rounded-2xl shadow-sm p-4 flex items-center gap-3">
      <Avatar size="lg">
        {group.photo_url && (
          <AvatarImage src={group.photo_url} alt={group.name} />
        )}
        <AvatarFallback className="bg-brand-200 text-brand-700 font-semibold">
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold truncate">{group.name}</h1>
        <div className="mt-1">
          <MemberAvatarStack members={group.members} />
        </div>
      </div>

      {isAdmin && (
        <Link
          href={`/groups/${group.id}/settings`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors shrink-0"
          aria-label="Configurações do grupo"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}
    </header>
  );
}
