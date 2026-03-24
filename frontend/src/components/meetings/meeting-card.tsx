"use client";

import { useState } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Link2,
  Trash2,
  Pencil,
  Download,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MeetingListItem, RsvpStatus } from "@/lib/types/meeting";
import { buildGoogleCalendarUrl } from "@/lib/types/meeting";
import {
  useUpdateRsvp,
  useDeleteMeeting,
  useDownloadIcs,
} from "@/hooks/use-meeting-mutations";
import { TYPE_BADGE, RSVP_OPTIONS, DATE_FORMATTER } from "./meeting-form-shared";
import { EditMeetingDialog } from "./edit-meeting-dialog";

interface MeetingCardProps {
  meeting: MeetingListItem;
  groupId: string;
  currentUserId: string;
  isAdmin: boolean;
}

export function MeetingCard({
  meeting,
  groupId,
  currentUserId,
  isAdmin,
}: MeetingCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const updateRsvp = useUpdateRsvp(groupId);
  const deleteMeeting = useDeleteMeeting(groupId);
  const downloadIcs = useDownloadIcs();

  const isCreator = meeting.created_by === currentUserId;
  const canManage = isCreator || isAdmin;
  const typeBadge = TYPE_BADGE[meeting.meeting_type];
  const formattedDate = DATE_FORMATTER.format(new Date(meeting.scheduled_at));

  const handleRsvp = (status: Exclude<RsvpStatus, "pending">) => {
    updateRsvp.mutate(
      { meetingId: meeting.id, status },
      { onError: (err) => toast.error(err.message) },
    );
  };

  const handleDelete = () => {
    if (!confirm("Tem certeza que deseja cancelar este encontro?")) return;
    deleteMeeting.mutate(meeting.id, {
      onError: (err) => toast.error(err.message),
      onSuccess: () => toast.success("Encontro cancelado"),
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.2, ease: "easeOut" }
      }
      className="rounded-xl border bg-card p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-base leading-tight">{meeting.title}</h3>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
          {typeBadge.icon} {typeBadge.label}
        </span>
      </div>

      {/* Date & details */}
      <div className="space-y-1.5 text-sm text-muted-foreground">
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
      <div className="flex gap-2 flex-wrap">
        {RSVP_OPTIONS.map(({ value, label }) => (
          <Button
            key={value}
            variant={meeting.my_rsvp_status === value ? "default" : "outline"}
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

      {/* Actions row */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1">
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
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-muted-foreground"
                onClick={() => setEditOpen(true)}
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
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
            </>
          )}
        </div>

        <span className="text-xs text-muted-foreground">
          por {meeting.creator_username}
        </span>
      </div>

      {editOpen && (
        <EditMeetingDialog
          meeting={meeting}
          groupId={groupId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </motion.div>
  );
}
