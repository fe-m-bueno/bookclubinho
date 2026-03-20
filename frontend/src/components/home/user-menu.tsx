"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Lock, LogOut, Settings, Trophy, User } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type { UserMe } from "@/lib/types/user";

interface UserMenuProps {
  user: UserMe;
}

function getInitials(user: UserMe): string {
  const name = user.display_name || user.username || user.email;
  return name.slice(0, 2).toUpperCase();
}

interface MenuContentProps {
  user: UserMe;
  onClose: () => void;
}

function MenuContent({ user, onClose }: MenuContentProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const handleLogout = async () => {
    onClose();
    await ensureCsrf();
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: withCsrf(),
    });
    router.push("/auth/login");
  };

  function navigate(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {/* Header */}
      <div className="flex items-center gap-3 px-2 py-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name ?? "Usuário"} />
          <AvatarFallback className="bg-primary/20 font-semibold">
            {getInitials(user)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold truncate">
            {user.display_name || user.username}
          </span>
          {user.username && (
            <span className="text-xs text-muted-foreground truncate">
              @{user.username}
            </span>
          )}
          {user.status_text && (
            <span className="text-xs text-muted-foreground truncate italic">
              {user.status_text}
            </span>
          )}
        </div>
      </div>

      <Separator />

      <Button
        variant="ghost"
        className="w-full justify-start gap-3 h-9"
        onClick={() => navigate("/settings/profile")}
      >
        <User className="h-4 w-4" />
        <span>Meu perfil</span>
      </Button>

      <Button
        variant="ghost"
        className="w-full justify-start gap-3 h-9"
        onClick={() => navigate("/settings")}
      >
        <Settings className="h-4 w-4" />
        <span>Configurações</span>
      </Button>

      <Button
        variant="ghost"
        className="w-full justify-start gap-3 h-9"
        onClick={() => navigate("/badges")}
      >
        <Trophy className="h-4 w-4" />
        <span>Meus badges</span>
      </Button>

      {/* Dark mode toggle */}
      <div className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent transition-colors">
        <span className="text-sm">Modo escuro</span>
        <Switch
          checked={isDark}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          aria-label="Alternar modo escuro"
        />
      </div>

      <Separator />

      <Button
        variant="ghost"
        className="w-full justify-start gap-3 h-9 text-destructive hover:text-destructive"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        <span>Sair</span>
      </Button>
    </div>
  );
}

export function UserMenu({ user }: UserMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const avatarButton = (
    <Avatar className="h-10 w-10">
      <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name ?? "Usuário"} />
      <AvatarFallback className="bg-primary/20 text-sm font-semibold">
        {getInitials(user)}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <>
      {/* Desktop: Popover */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Menu do usuário"
            >
              {avatarButton}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-0">
            <MenuContent user={user} onClose={() => setPopoverOpen(false)} />
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile: Drawer */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Menu do usuário"
        >
          {avatarButton}
        </button>

        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle className="sr-only">Menu do usuário</DrawerTitle>
            </DrawerHeader>
            <div className="pb-8">
              <MenuContent user={user} onClose={() => setDrawerOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </>
  );
}
