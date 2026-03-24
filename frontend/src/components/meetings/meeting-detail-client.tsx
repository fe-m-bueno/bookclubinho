"use client";

import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  Link2,
  Trash2,
  Download,
  ExternalLink,
  ChevronLeft,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { buildGoogleCalendarUrl } from "@/lib/types/meeting";
import { getInitials } from "@/lib/utils";
import { useMeetingDetail } from "@/hooks/use-meeting-detail";
import {
  useUpdateRsvpStandalone,
  useDeleteMeetingStandalone,
  useDownloadIcs,
} from "@/hooks/use-meeting-mutations";
import type { RsvpStatus } from "@/lib/types/meeting";
import { TYPE_BADGE, RSVP_OPTIONS, RSVP_LABELS, DATE_FORMATTER, DATE_ONLY_FORMATTER } from "./meeting-form-shared";
import { MeetingDetailSkeleton } from "./meeting-skeleton";

const RSVP_COLORS: Record<RsvpStatus, string> = {
  going: "text-green-600",
  maybe: "text-yellow-600",
  not_going: "text-red-600",
  pending: "text-muted-foreground",
};

interface MeetingDetailClientProps {
  meetingId: string;
}

export function MeetingDetailClient({ meetingId }: MeetingDetailClientProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const { data: meeting, isLoading } = useMeetingDetail(meetingId);

  const updateRsvp = useUpdateRsvpStandalone(meetingId);
  const deleteMeeting = useDeleteMeetingStandalone();
  const downloadIcs = useDownloadIcs();

  if (isLoading || !meeting) {
    return <MeetingDetailSkeleton />;
  }

  const typeBadge = TYPE_BADGE[meeting.meeting_type];
  const formattedDate = DATE_FORMATTER.format(new Date(meeting.scheduled_at));

  const handleRsvp = (status: Exclude<RsvpStatus, "pending">) => {
    updateRsvp.mutate(
      { status },
      { onError: (err) => toast.error(err.message) },
    );
  };

  const handleDelete = () => {
    if (!confirm("Tem certeza que deseja cancelar este encontro?")) return;
    deleteMeeting.mutate(meeting.id, {
      onError: (err) => toast.error(err.message),
      onSuccess: () => {
        toast.success("Encontro cancelado");
        router.push(`/groups/${meeting.group_id}/meetings`);
      },
    });
  };

  const handleDownloadIcs = () => {
    downloadIcs.mutate(meeting.id, {
      onError: (err) => toast.error(err.message),
    });
  };

  const handleGoogleCalendar = () => {
    const url = buildGoogleCalendarUrl(meeting);
    window.open(url, "_blank", "noopener");
  };

  const currentUserRsvp = meeting.rsvps.find(
    (r) => r.status !== "pending",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 300, damping: 30 }
      }
      className="space-y-6"
    >
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-2"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>

      {/* Header */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">{meeting.title}</h1>
            <span className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-muted px-3 py-1 text-sm font-medium">
              {typeBadge.icon} {typeBadge.label}
            </span>
          </div>
        </div>

        {/* Date & details */}
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="capitalize">{formattedDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{meeting.duration_minutes} min</span>
          </div>
          {meeting.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{meeting.location}</span>
            </div>
          )}
          {meeting.virtual_link && (
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0" />
              <a
                href={meeting.virtual_link}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground truncate"
              >
                Link da reunião
              </a>
            </div>
          )}
        </div>

        {meeting.description && (
          <p className="text-sm text-muted-foreground">{meeting.description}</p>
        )}

        {/* RSVP buttons */}
        <div className="flex gap-2 flex-wrap pt-2 border-t">
          {RSVP_OPTIONS.map(({ value, label }) => (
            <Button
              key={value}
              variant={currentUserRsvp?.status === value ? "default" : "outline"}
              size="sm"
              className="min-h-[36px]"
              onClick={() => handleRsvp(value)}
              disabled={updateRsvp.isPending}
            >
              {label}
              {meeting.rsvp_counts[value] > 0 && (
                <span className="ml-1.5 text-xs opacity-70">
                  {meeting.rsvp_counts[value]}
                </span>
              )}
            </Button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={handleDownloadIcs}
            title="Baixar .ics"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={handleGoogleCalendar}
            title="Google Calendar"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-destructive hover:text-destructive"
            onClick={handleDelete}
            title="Cancelar encontro"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Participants section */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">
            Participantes ({meeting.rsvps.length})
          </h2>
        </div>

        {meeting.rsvps.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ninguém respondeu ainda
          </p>
        ) : (
          <div className="space-y-2">
            {meeting.rsvps.map((rsvp) => (
              <div
                key={rsvp.user_id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors"
              >
                <Avatar size="sm">
                  {rsvp.avatar_url && (
                    <AvatarImage src={rsvp.avatar_url} alt={rsvp.username} />
                  )}
                  <AvatarFallback>
                    {getInitials(rsvp.display_name || rsvp.username || "?")}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {rsvp.display_name || rsvp.username}
                  </p>
                  <p className={`text-xs font-medium ${RSVP_COLORS[rsvp.status]}`}>
                    {rsvp.status !== "pending" ? RSVP_LABELS[rsvp.status] : "Sem resposta"}
                  </p>
                </div>

                {rsvp.responded_at && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {DATE_ONLY_FORMATTER.format(new Date(rsvp.responded_at))}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Creator info */}
      <div className="text-xs text-muted-foreground text-center">
        Criado por {meeting.creator_username} em{" "}
        {DATE_ONLY_FORMATTER.format(new Date(meeting.created_at))}
      </div>
    </motion.div>
  );
}
