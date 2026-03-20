"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/auth/form-field";
import { useUpdateMeeting } from "@/hooks/use-meeting-mutations";
import type { MeetingListItem } from "@/lib/types/meeting";
import { meetingSchema, TYPE_OPTIONS } from "./meeting-form-shared";
import type { MeetingFormData } from "./meeting-form-shared";

interface EditMeetingDialogProps {
  meeting: MeetingListItem;
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMeetingDialog({
  meeting,
  groupId,
  open,
  onOpenChange,
}: EditMeetingDialogProps) {
  const updateMeeting = useUpdateMeeting(groupId);

  const scheduledDate = new Date(meeting.scheduled_at);
  const dateStr = scheduledDate.toISOString().split("T")[0];
  const timeStr = scheduledDate.toTimeString().slice(0, 5);

  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      title: meeting.title,
      description: meeting.description || "",
      meeting_type: meeting.meeting_type,
      location: meeting.location || "",
      virtual_link: meeting.virtual_link || "",
      date: dateStr,
      time: timeStr,
      duration_minutes: meeting.duration_minutes,
    },
    mode: "onChange",
  });

  const meetingType = form.watch("meeting_type");
  const title = form.watch("title");

  const showLocation = meetingType === "in_person" || meetingType === "hybrid";
  const showLink = meetingType === "virtual" || meetingType === "hybrid";

  async function onSubmit(data: MeetingFormData) {
    const scheduledAt = new Date(`${data.date}T${data.time}`).toISOString();

    updateMeeting.mutate(
      {
        meetingId: meeting.id,
        payload: {
          title: data.title,
          description: data.description || null,
          meeting_type: data.meeting_type,
          location: data.location || null,
          virtual_link: data.virtual_link || null,
          scheduled_at: scheduledAt,
          duration_minutes: data.duration_minutes,
        },
      },
      {
        onSuccess: () => {
          toast.success("Encontro atualizado!");
          onOpenChange(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Encontro</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            label="Título"
            htmlFor="edit-meeting-title"
            error={form.formState.errors.title?.message}
          >
            <div className="relative">
              <Input
                id="edit-meeting-title"
                maxLength={200}
                autoFocus
                {...form.register("title")}
              />
              <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
                {title.length}/200
              </span>
            </div>
          </FormField>

          <FormField
            label="Descrição (opcional)"
            htmlFor="edit-meeting-description"
            error={form.formState.errors.description?.message}
          >
            <Textarea
              id="edit-meeting-description"
              className="resize-none"
              maxLength={2000}
              rows={3}
              {...form.register("description")}
            />
          </FormField>

          <FormField
            label="Tipo"
            htmlFor="edit-meeting-type"
            error={form.formState.errors.meeting_type?.message}
          >
            <div className="flex gap-2">
              {TYPE_OPTIONS.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  variant={meetingType === value ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => form.setValue("meeting_type", value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </FormField>

          {showLocation && (
            <FormField
              label="Local"
              htmlFor="edit-meeting-location"
              error={form.formState.errors.location?.message}
            >
              <Input
                id="edit-meeting-location"
                {...form.register("location")}
              />
            </FormField>
          )}

          {showLink && (
            <FormField
              label="Link da reunião"
              htmlFor="edit-meeting-link"
              error={form.formState.errors.virtual_link?.message}
            >
              <Input
                id="edit-meeting-link"
                {...form.register("virtual_link")}
              />
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Data"
              htmlFor="edit-meeting-date"
              error={form.formState.errors.date?.message}
            >
              <Input
                id="edit-meeting-date"
                type="date"
                {...form.register("date")}
              />
            </FormField>

            <FormField
              label="Horário"
              htmlFor="edit-meeting-time"
              error={form.formState.errors.time?.message}
            >
              <Input
                id="edit-meeting-time"
                type="time"
                {...form.register("time")}
              />
            </FormField>
          </div>

          <FormField
            label="Duração (minutos)"
            htmlFor="edit-meeting-duration"
            error={form.formState.errors.duration_minutes?.message}
          >
            <Input
              id="edit-meeting-duration"
              type="number"
              min={15}
              max={480}
              {...form.register("duration_minutes", { valueAsNumber: true })}
            />
          </FormField>

          <Button
            type="submit"
            className="w-full h-11"
            disabled={!form.formState.isValid || updateMeeting.isPending}
          >
            {updateMeeting.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Salvar alterações"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
