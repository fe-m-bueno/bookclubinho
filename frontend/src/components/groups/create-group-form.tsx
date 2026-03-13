"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/auth/form-field";
import { GroupPhotoUpload } from "./group-photo-upload";
import { withCsrf } from "@/lib/csrf";
import type { GroupCreateResponse } from "@/lib/types/group";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const createGroupSchema = z.object({
  name: z
    .string()
    .min(2, "Mínimo de 2 caracteres")
    .max(50, "Máximo de 50 caracteres"),
  description: z
    .string()
    .max(200, "Máximo de 200 caracteres")
    .optional()
    .or(z.literal("")),
});

type CreateGroupFormData = z.infer<typeof createGroupSchema>;

interface CreateGroupFormProps {
  onSuccess: (data: GroupCreateResponse) => void;
}

export function CreateGroupForm({ onSuccess }: CreateGroupFormProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<CreateGroupFormData>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: "", description: "" },
    mode: "onChange",
  });

  const name = form.watch("name");
  const description = form.watch("description") ?? "";

  async function onSubmit(data: CreateGroupFormData) {
    setSubmitting(true);

    const formData = new FormData();
    formData.append("name", data.name);
    if (data.description) formData.append("description", data.description);
    if (photo) formData.append("photo", photo);

    try {
      const res = await fetch(`${API_URL}/api/v1/groups/`, {
        method: "POST",
        headers: withCsrf(),
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        const body: GroupCreateResponse = await res.json();
        onSuccess(body);
        return;
      }

      if (res.status === 422) {
        const body = await res.json();
        toast.error(body.detail || "Erro de validação");
      } else if (res.status === 401) {
        toast.error("Sessão expirada. Faça login novamente.");
      } else if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
      } else {
        toast.error("Erro ao criar clube. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Verifique sua internet.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      <GroupPhotoUpload value={photo} onChange={setPhoto} />

      <FormField
        label="Nome do clube"
        htmlFor="create-group-name"
        error={form.formState.errors.name?.message}
      >
        <div className="relative">
          <Input
            id="create-group-name"
            type="text"
            placeholder="Ex: Leitores Noturnos"
            maxLength={50}
            autoFocus
            {...form.register("name")}
          />
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
            {name.length}/50
          </span>
        </div>
      </FormField>

      <FormField
        label="Descrição"
        htmlFor="create-group-description"
        error={form.formState.errors.description?.message}
      >
        <div className="relative">
          <Textarea
            id="create-group-description"
            placeholder="Do que se trata o clube? (opcional)"
            className="resize-none"
            maxLength={200}
            rows={3}
            {...form.register("description")}
          />
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
            {description.length}/200
          </span>
        </div>
      </FormField>

      <Button
        type="submit"
        className="w-full h-11"
        disabled={!form.formState.isValid || submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Criar clube"
        )}
      </Button>
    </form>
  );
}
