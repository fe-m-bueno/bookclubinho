"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/auth/form-field";
import { AvatarUpload } from "./avatar-upload";
import { UsernameField } from "./username-field";
import { USERNAME_REGEX, type UsernameStatus } from "@/hooks/use-username-check";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const profileSchema = z.object({
  username: z
    .string()
    .min(3, "Mínimo de 3 caracteres")
    .max(20, "Máximo de 20 caracteres")
    .regex(
      USERNAME_REGEX,
      "Deve começar com letra. Apenas letras, números e _",
    ),
  displayName: z
    .string()
    .min(2, "Mínimo de 2 caracteres")
    .max(50, "Máximo de 50 caracteres"),
  statusText: z.string().max(100, "Máximo de 100 caracteres").optional().or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

interface StepProfileFormProps {
  onNext: () => void;
}

export function StepProfileForm({ onNext }: StepProfileFormProps) {
  const [avatar, setAvatar] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: "", displayName: "", statusText: "" },
    mode: "onChange",
  });

  const username = form.watch("username");
  const statusText = form.watch("statusText") ?? "";

  const isUsernameOk = usernameStatus === "available";
  const canSubmit = form.formState.isValid && isUsernameOk && !submitting;

  const handleUsernameStatusChange = useCallback((status: UsernameStatus) => {
    setUsernameStatus(status);
  }, []);

  useEffect(() => {
    form.setFocus("username");
  }, [form]);

  async function onSubmit(data: ProfileFormData) {
    setSubmitting(true);

    const formData = new FormData();
    formData.append("username", data.username);
    formData.append("display_name", data.displayName);
    if (data.statusText) formData.append("status_text", data.statusText);
    if (avatar) formData.append("avatar", avatar);

    try {
      const res = await fetch(`${API_URL}/api/v1/onboarding/profile`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        onNext();
        return;
      }

      if (res.status === 422) {
        const body = await res.json();
        toast.error(body.detail || "Erro de validação");
      } else if (res.status === 409) {
        toast.error("Username já está em uso");
      } else if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
      } else {
        toast.error("Erro ao salvar perfil. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Verifique sua internet.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <AvatarUpload value={avatar} onChange={setAvatar} />

      <UsernameField
        registration={form.register("username")}
        error={form.formState.errors.username}
        username={username}
        onStatusChange={handleUsernameStatusChange}
      />

      <FormField
        label="Nome de exibição"
        htmlFor="onboarding-display-name"
        error={form.formState.errors.displayName?.message}
      >
        <Input
          id="onboarding-display-name"
          type="text"
          placeholder="Como quer ser chamado"
          autoComplete="name"
          {...form.register("displayName")}
        />
      </FormField>

      <FormField
        label="Status"
        htmlFor="onboarding-status"
        error={form.formState.errors.statusText?.message}
      >
        <div className="relative">
          <Textarea
            id="onboarding-status"
            placeholder="Lendo um bom livro..."
            className="resize-none"
            maxLength={100}
            rows={2}
            {...form.register("statusText")}
          />
          <span className="absolute bottom-2 right-3 text-xs text-muted-foreground">
            {statusText.length}/100
          </span>
        </div>
      </FormField>

      <Button type="submit" className="w-full h-11" disabled={!canSubmit}>
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Próximo"
        )}
      </Button>
    </form>
  );
}
