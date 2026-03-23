"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  Lock,
  Menu,
  Plug,
  Shield,
  Smartphone,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import Link from "next/link";

const sections = [
  { label: "Perfil", href: "/settings/profile", icon: User },
  { label: "Conta", href: "/settings/account", icon: Lock },
  { label: "Notificações", href: "/settings/notifications", icon: Bell },
  { label: "Integrações", href: "/settings/integrations", icon: Plug },
  { label: "Sessões", href: "/settings/sessions", icon: Smartphone },
  { label: "Dados e Privacidade", href: "/settings/privacy", icon: Shield },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {sections.map(({ label, href, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            replace
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-2xl text-sm transition-colors ${
              active
                ? "bg-sage-100 dark:bg-sage-900/30 font-medium"
                : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

interface SettingsShellProps {
  children: React.ReactNode;
}

export function SettingsShell({ children }: SettingsShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background/95 backdrop-blur z-10">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-1 -ml-1 rounded-lg hover:bg-accent transition-colors"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-base">Configurações</span>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="p-1 -mr-1 rounded-lg hover:bg-accent transition-colors"
          aria-label="Menu de configurações"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile Sheet nav */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="left" className="w-72 pt-8">
          <SheetHeader>
            <SheetTitle className="text-left">Configurações</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <NavLinks pathname={pathname} onNavigate={() => setSheetOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop layout */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="hidden md:flex gap-8">
          {/* Sidebar */}
          <aside className="w-60 shrink-0">
            <div className="sticky top-8">
              <div className="flex items-center gap-2 mb-6">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="p-1 rounded-lg hover:bg-accent transition-colors"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h1 className="font-display font-semibold text-base">Configurações</h1>
              </div>
              <NavLinks pathname={pathname} />
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>

        {/* Mobile content */}
        <div className="md:hidden">{children}</div>
      </div>
    </div>
  );
}
