import { AllMeetingsClient } from "@/components/meetings/all-meetings-client";

export const metadata = { title: "Encontros" };

export default function MeetingsPage() {
  return (
    <main className="flex-1 container mx-auto px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Encontros</h1>
          <p className="text-muted-foreground mt-1">
            Próximos encontros dos seus clubes
          </p>
        </div>

        <AllMeetingsClient />
      </div>
    </main>
  );
}
