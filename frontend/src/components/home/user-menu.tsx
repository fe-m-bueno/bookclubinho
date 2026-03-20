"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import type { UserMe } from "@/lib/types/user";

interface UserMenuProps {
  user: UserMe;
}

function getInitials(user: UserMe): string {
  const name = user.display_name || user.username || user.email;
  return name.slice(0, 2).toUpperCase();
}

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const handleLogout = async () => {
    await ensureCsrf();
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: withCsrf(),
    });
    router.push("/auth/login");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Menu do usuário"
      >
        <Avatar className="h-10 w-10">
          <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name ?? "Usuário"} />
          <AvatarFallback className="bg-primary/20 text-sm font-semibold">
            {getInitials(user)}
          </AvatarFallback>
        </Avatar>
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.avatar_url ?? undefined} alt={user.display_name ?? "Usuário"} />
                <AvatarFallback className="bg-primary/20 font-semibold">
                  {getInitials(user)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start">
                <span className="text-base font-semibold">
                  {user.display_name || user.username}
                </span>
                <span className="text-sm font-normal text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex flex-col gap-1 p-4 pb-8">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <span className="text-lg">{theme === "dark" ? "☀️" : "🌙"}</span>
              <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              onClick={() => {
                setOpen(false);
                router.push("/profile");
              }}
            >
              <Settings className="h-5 w-5" />
              <span>Perfil</span>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
