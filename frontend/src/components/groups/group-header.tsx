"use client";

import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
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
    <header className="flex items-center gap-2 py-4 sm:gap-4">
      {/* Seta e não casinha: home é raiz, grupo é pilha. Era o único caminho de
          volta do app inteiro, e vinha em 36px — abaixo do alvo de 44px que o
          #271 fixou e só conseguiu aplicar em quem usa o componente `Button`. */}
      <Link
        href="/"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted"
        aria-label="Voltar para o início"
      >
        <ArrowLeft className="h-5 w-5 text-muted-foreground" />
      </Link>

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

      {/* Sem `ThemeToggle` aqui: o `UserMenu` ao lado já tem "Modo escuro", e
          eram dois controles do mesmo estado na mesma tela. Os 40px que ele
          ocupava vão para o nome do clube, que em 375px vinha truncado. */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        {isAdmin && (
          <Link
            href={`/groups/${group.id}/settings`}
            className="inline-flex size-11 items-center justify-center rounded-md transition-colors hover:bg-muted"
            aria-label="Configurações do grupo"
          >
            <Settings className="h-5 w-5 text-muted-foreground" />
          </Link>
        )}
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}
