"use client";

import { useEffect, useRef } from "react";
import { Camera, User } from "lucide-react";
import { toast } from "sonner";

interface AvatarUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function AvatarUpload({ value, onChange }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
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

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    onChange(file);
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        className="relative w-24 h-24 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
        onClick={() => inputRef.current?.click()}
        aria-label="Enviar foto de perfil"
      >
        {objectUrlRef.current && value ? (
          <img
            src={objectUrlRef.current}
            alt="Preview do avatar"
            className="w-24 h-24 rounded-full object-cover border-2 border-border"
          />
        ) : (
          <div className="w-24 h-24 rounded-full border-2 border-dashed border-muted-foreground/50 bg-muted flex items-center justify-center">
            <User className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
          <Camera className="h-4 w-4" />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleChange}
          tabIndex={-1}
        />
      </button>
    </div>
  );
}
