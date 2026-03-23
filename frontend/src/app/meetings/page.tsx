import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AllMeetingsClient } from "@/components/meetings/all-meetings-client";

export const metadata = { title: "Encontros" };

export default function MeetingsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background pb-24">
      <header className="px-6 pt-10 pb-8">
        <div className="mx-auto max-w-2xl">
          <Button variant="ghost" size="sm" asChild className="gap-1 px-2 mb-4">
            <Link href="/">
              <ChevronLeft className="size-4" />
              Voltar
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">agenda</p>
          <h1 className="mt-1 text-3xl font-display font-bold tracking-tight md:text-4xl">
            encontros
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6">
        <AllMeetingsClient />
      </main>
    </div>
  );
}
