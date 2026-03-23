"use client";

import Link from "next/link";
import { ChevronLeft, Settings } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { MemberAvatarStack } from "./member-avatar-stack";
import { UserMenu } from "@/components/home/user-menu";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupHeaderProps {
  group: GroupDetailResponse;
}

export function GroupHeader({ group }: GroupHeaderProps) {
  const isAdmin = group.invite_code !== null;
  const initial = group.name.charAt(0).toUpperCase();
  const { data: user } = useCurrentUser();

  return (
    <header className="flex items-center gap-4 py-4">
      <Avatar size="lg">
        {group.photo_url && (
          <AvatarImage src={group.photo_url} alt={group.name} />
        )}
        <AvatarFallback className="bg-sage-100 text-sage-700 font-display font-bold text-lg dark:bg-sage-800 dark:text-sage-200">
          {initial}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-display font-bold tracking-tight">
          {group.name}
        </h1>
        <div className="mt-1">
          <MemberAvatarStack members={group.members} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Link
          href="/"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
          aria-label="Voltar para o início"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </Link>
        <ThemeToggle />
        {isAdmin && (
          <Link
            href={`/groups/${group.id}/settings`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-muted"
            aria-label="Configurações do grupo"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Link>
        )}
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}
