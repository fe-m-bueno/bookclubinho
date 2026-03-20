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
import { useCreateMeeting } from "@/hooks/use-meeting-mutations";
import { meetingSchema, TYPE_OPTIONS } from "./meeting-form-shared";
import type { MeetingFormData } from "./meeting-form-shared";

interface CreateMeetingDialogProps {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateMeetingDialog({
  groupId,
  open,
  onOpenChange,
}: CreateMeetingDialogProps) {
  const createMeeting = useCreateMeeting(groupId);

  const form = useForm<MeetingFormData>({
    resolver: zodResolver(meetingSchema),
    defaultValues: {
      title: "",
      description: "",
      meeting_type: "in_person",
      location: "",
      virtual_link: "",
      date: "",
      time: "19:00",
      duration_minutes: 60,
    },
    mode: "onChange",
  });

  const meetingType = form.watch("meeting_type");
  const title = form.watch("title");

  const showLocation = meetingType === "in_person" || meetingType === "hybrid";
  const showLink = meetingType === "virtual" || meetingType === "hybrid";

  async function onSubmit(data: MeetingFormData) {
    const scheduledAt = new Date(`${data.date}T${data.time}`).toISOString();

    createMeeting.mutate(
      {
        title: data.title,
        description: data.description || null,
        meeting_type: data.meeting_type,
        location: data.location || null,
        virtual_link: data.virtual_link || null,
        scheduled_at: scheduledAt,
        duration_minutes: data.duration_minutes,
      },
      {
        onSuccess: () => {
          toast.success("Encontro criado!");
          onOpenChange(false);
          form.reset();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Encontro</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <FormField
            label="Título"
            htmlFor="meeting-title"
            error={form.formState.errors.title?.message}
          >
            <div className="relative">
              <Input
                id="meeting-title"
                placeholder="Ex: Discussão do capítulo 5"
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
            htmlFor="meeting-description"
            error={form.formState.errors.description?.message}
          >
            <Textarea
              id="meeting-description"
              placeholder="Detalhes sobre o encontro..."
              className="resize-none"
              maxLength={2000}
              rows={3}
              {...form.register("description")}
            />
          </FormField>

          <FormField
            label="Tipo"
            htmlFor="meeting-type"
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
              htmlFor="meeting-location"
              error={form.formState.errors.location?.message}
            >
              <Input
                id="meeting-location"
                placeholder="Endereço ou local"
                {...form.register("location")}
              />
            </FormField>
          )}

          {showLink && (
            <FormField
              label="Link da reunião"
              htmlFor="meeting-link"
              error={form.formState.errors.virtual_link?.message}
            >
              <Input
                id="meeting-link"
                placeholder="https://meet.google.com/..."
                {...form.register("virtual_link")}
              />
            </FormField>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Data"
              htmlFor="meeting-date"
              error={form.formState.errors.date?.message}
            >
              <Input
                id="meeting-date"
                type="date"
                {...form.register("date")}
              />
            </FormField>

            <FormField
              label="Horário"
              htmlFor="meeting-time"
              error={form.formState.errors.time?.message}
            >
              <Input
                id="meeting-time"
                type="time"
                {...form.register("time")}
              />
            </FormField>
          </div>

          <FormField
            label="Duração (minutos)"
            htmlFor="meeting-duration"
            error={form.formState.errors.duration_minutes?.message}
          >
            <Input
              id="meeting-duration"
              type="number"
              min={15}
              max={480}
              {...form.register("duration_minutes", { valueAsNumber: true })}
            />
          </FormField>

          <Button
            type="submit"
            className="w-full h-11"
            disabled={!form.formState.isValid || createMeeting.isPending}
          >
            {createMeeting.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Criar encontro"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
