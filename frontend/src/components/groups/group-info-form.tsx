"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { GroupPhotoUpload } from "./group-photo-upload";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupInfoFormProps {
  group: GroupDetailResponse;
  refetch: () => void;
}

export function GroupInfoForm({ group, refetch }: GroupInfoFormProps) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [photo, setPhoto] = useState<File | null>(null);

  const { submit, loading } = useAuthSubmit({
    url: `/api/v1/groups/${group.id}`,
    method: "PATCH",
    headers: {},
    onSuccess: () => {
      toast.success("Clube atualizado!");
      refetch();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", name);
    fd.append("description", description);
    if (photo) fd.append("photo", photo);
    submit(fd);
  }

  const nameLen = name.trim().length;
  const descLen = description.length;
  const nameValid = nameLen >= 2 && nameLen <= 60;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5"
    >
      <h3 className="font-semibold">Informações do clube</h3>

      <GroupPhotoUpload value={photo} onChange={setPhoto} existingUrl={group.photo_url} />

      <div className="space-y-2">
        <Label htmlFor="group-name">Nome</Label>
        <Input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          minLength={2}
          required
        />
        <p className="text-xs text-muted-foreground text-right">
          {nameLen}/60
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="group-description">Descrição</Label>
        <Textarea
          id="group-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Sobre o que é o clube..."
        />
        <p className="text-xs text-muted-foreground text-right">
          {descLen}/500
        </p>
      </div>

      <Button
        type="submit"
        disabled={loading || !nameValid}
        className="w-full h-11"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salvar alterações
      </Button>
    </form>
  );
}
