import { MeetingDetailClient } from "@/components/meetings/meeting-detail-client";

export const metadata = { title: "Encontro" };

interface MeetingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MeetingDetailPage({
  params,
}: MeetingDetailPageProps) {
  const { id } = await params;

  return (
    <main className="flex-1 container mx-auto px-4 py-8">
      <MeetingDetailClient meetingId={id} />
    </main>
  );
}
