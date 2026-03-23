"use client";

import { Calendar } from "lucide-react";
import { useUpcomingMeetings } from "@/hooks/use-upcoming-meetings";
import { UpcomingMeetingPill } from "@/components/home/upcoming-meeting-pill";
import { MeetingSkeleton } from "./meeting-skeleton";

export function AllMeetingsClient() {
  const { data, isLoading } = useUpcomingMeetings(50);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <MeetingSkeleton />
      </div>
    );
  }

  const meetings = data?.meetings ?? [];

  if (meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground text-sm">
          Nenhum encontro agendado
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meetings.map((meeting) => (
        <UpcomingMeetingPill key={meeting.id} meeting={meeting} />
      ))}
    </div>
  );
}
