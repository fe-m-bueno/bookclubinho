"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, MapPin, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MeetingType, RsvpStatus, UpcomingMeetingItem } from "@/lib/types/meeting";

interface UpcomingMeetingPillProps {
  meeting: UpcomingMeetingItem;
}

const RSVP_COLORS: Record<RsvpStatus, string> = {
  going: "bg-green-500",
  maybe: "bg-yellow-500",
  not_going: "bg-red-500",
  pending: "bg-muted-foreground",
};

const MEETING_ICONS: Record<MeetingType, typeof Calendar> = {
  virtual: Video,
  hybrid: MapPin,
  in_person: Calendar,
};

export function UpcomingMeetingPill({ meeting }: UpcomingMeetingPillProps) {
  const router = useRouter();

  const scheduledAt = new Date(meeting.scheduled_at);
  const dateStr = format(scheduledAt, "d 'de' MMM 'às' HH:mm", {
    locale: ptBR,
  });

  const MeetingIcon = MEETING_ICONS[meeting.meeting_type] ?? Calendar;

  return (
    <button
      type="button"
      onClick={() => router.push(`/meetings/${meeting.id}`)}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <MeetingIcon className="h-4 w-4 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{meeting.title}</p>
          {meeting.my_rsvp_status && (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${RSVP_COLORS[meeting.my_rsvp_status] ?? "bg-muted-foreground"}`}
              aria-label={`RSVP: ${meeting.my_rsvp_status}`}
            />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="h-4 px-1 text-xs">
            {meeting.group_name}
          </Badge>
          <span className="text-xs text-muted-foreground">{dateStr}</span>
        </div>
      </div>
    </button>
  );
}
