import { z } from "zod";
import type { MeetingType } from "@/lib/types/meeting";

export const meetingSchema = z.object({
  title: z
    .string()
    .min(1, "Obrigatório")
    .max(200, "Máximo de 200 caracteres"),
  description: z
    .string()
    .max(2000, "Máximo de 2000 caracteres")
    .optional()
    .or(z.literal("")),
  meeting_type: z.enum(["in_person", "virtual", "hybrid"]),
  location: z
    .string()
    .max(500)
    .optional()
    .or(z.literal("")),
  virtual_link: z
    .string()
    .max(2000)
    .optional()
    .or(z.literal("")),
  date: z.string().min(1, "Obrigatório"),
  time: z.string().min(1, "Obrigatório"),
  duration_minutes: z.number().min(15).max(480),
});

export type MeetingFormData = z.infer<typeof meetingSchema>;

export const TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: "in_person", label: "🏠 Presencial" },
  { value: "virtual", label: "💻 Virtual" },
  { value: "hybrid", label: "🔄 Híbrido" },
];

export const TYPE_BADGE: Record<string, { label: string; icon: string }> = {
  in_person: { label: "Presencial", icon: "🏠" },
  virtual: { label: "Virtual", icon: "💻" },
  hybrid: { label: "Híbrido", icon: "🔄" },
};
