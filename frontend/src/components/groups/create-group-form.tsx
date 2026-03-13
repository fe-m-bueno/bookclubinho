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
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import type { GroupCreateResponse } from "@/lib/types/group";

const NO_CONTENT_TYPE = {} as const;

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

  const form = useForm<CreateGroupFormData>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: { name: "", description: "" },
    mode: "onChange",
  });

  const name = form.watch("name");
  const description = form.watch("description") ?? "";

  const { submit, loading: submitting } = useAuthSubmit({
    url: "/api/v1/groups/",
    headers: NO_CONTENT_TYPE,
    onSuccess: async (res) => {
      const body: GroupCreateResponse = await res.json();
      onSuccess(body);
    },
    statusHandlers: [
      {
        status: 422,
        handler: async (res) => {
          const body = await res.json();
          toast.error(body.detail || "Erro de validação");
        },
      },
      {
        status: 401,
        handler: () => toast.error("Sessão expirada. Faça login novamente."),
      },
    ],
  });

  async function onSubmit(data: CreateGroupFormData) {
    const formData = new FormData();
    formData.append("name", data.name);
    if (data.description) formData.append("description", data.description);
    if (photo) formData.append("photo", photo);

    await submit(formData);
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
