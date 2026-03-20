"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ensureCsrf, withCsrf } from "@/lib/csrf";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

interface ProfileAvatarUploadProps {
  avatarUrl: string | null;
  initials: string;
}

export function ProfileAvatarUpload({ avatarUrl, initials }: ProfileAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("Imagem muito grande. Máximo de 5MB.");
      return;
    }

    setUploading(true);
    try {
      await ensureCsrf();
      const formData = new FormData();
      formData.append("avatar", file);

      const res = await fetch("/api/v1/users/me/avatar", {
        method: "POST",
        headers: withCsrf({}),
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        toast.success("Foto atualizada!");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail ?? "Erro ao enviar foto.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await ensureCsrf();
      const res = await fetch("/api/v1/users/me/avatar", {
        method: "DELETE",
        headers: withCsrf(),
        credentials: "include",
      });

      if (res.ok) {
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
        toast.success("Foto removida.");
      } else {
        toast.error("Erro ao remover foto.");
      }
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <motion.button
          type="button"
          disabled={uploading}
          onClick={() => !uploading && inputRef.current?.click()}
          className="relative w-24 h-24 rounded-full cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Alterar foto de perfil"
          whileHover={!uploading ? { scale: 1.05 } : undefined}
          whileTap={!uploading ? { scale: 0.97 } : undefined}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <Avatar className="h-24 w-24">
            <AvatarImage src={avatarUrl ?? undefined} alt="Foto de perfil" />
            <AvatarFallback className="bg-primary/20 text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <AnimatePresence>
            {uploading ? (
              <motion.div
                key="loading"
                className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </motion.div>
            ) : (
              <motion.div
                key="camera"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
              >
                <Camera className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          tabIndex={-1}
        />
      </div>

      {avatarUrl && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={uploading}
          onClick={handleRemove}
          className="text-muted-foreground hover:text-destructive gap-2"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover foto
        </Button>
      )}
    </div>
  );
}
