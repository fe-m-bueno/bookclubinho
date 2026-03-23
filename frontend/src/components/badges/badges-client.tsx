"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBadges } from "@/hooks/use-badges";
import { BadgesSkeleton } from "./badges-skeleton";
import { BadgeGrid } from "./badge-grid";
import type { BadgeResponse } from "@/lib/types/badge";

const TABS = [
  { value: "all", label: "Todas" },
  { value: "reading", label: "Leitura" },
  { value: "social", label: "Social" },
  { value: "streak", label: "Sequência" },
  { value: "achievement", label: "Conquistas" },
  { value: "fun", label: "Diversão" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function BadgesClient() {
  const { myBadges, catalog, loading, error, refetch } = useBadges();
  const [activeTab, setActiveTab] = useState<TabValue>("all");

  const earnedSlugs = useMemo<Set<string>>(() => {
    const all = Object.values(myBadges).flat();
    return new Set(all.map((b) => b.slug));
  }, [myBadges]);

  const mergedBadges = useMemo<Array<BadgeResponse & { isEarned: boolean }>>(
    () =>
      catalog.map((badge) => ({
        ...badge,
        isEarned: earnedSlugs.has(badge.slug),
      })),
    [catalog, earnedSlugs],
  );

  const filteredBadges = useMemo(() => {
    if (activeTab === "all") return mergedBadges;
    return mergedBadges.filter((b) => b.category === activeTab);
  }, [mergedBadges, activeTab]);

  const earnedCount = earnedSlugs.size;
  const totalCount = catalog.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild className="gap-1 px-2">
            <Link href="/">
              <ChevronLeftIcon className="size-4" />
              Voltar
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-semibold truncate">
              Minhas Conquistas
            </h1>
            {!loading && !error && (
              <p className="text-sm text-muted-foreground">
                {earnedCount} de {totalCount} desbloqueadas
              </p>
            )}
          </div>
        </header>

        {loading && <BadgesSkeleton />}

        {!loading && error != null && (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-muted-foreground">{error}</p>
            <Button type="button" onClick={refetch}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!loading && error == null && (
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabValue)}
          >
            <div className="overflow-x-auto pb-1">
              <TabsList className="w-max">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="mt-4">
                {filteredBadges.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-muted-foreground text-sm">
                      Nenhuma conquista nesta categoria.
                    </p>
                  </div>
                ) : (
                  <BadgeGrid badges={filteredBadges} />
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </div>
  );
}
