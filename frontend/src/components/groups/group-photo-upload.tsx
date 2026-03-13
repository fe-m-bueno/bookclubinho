"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera } from "lucide-react";
import { toast } from "sonner";

interface GroupPhotoUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function GroupPhotoUpload({ value, onChange }: GroupPhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPreviewUrl(url);
    onChange(file);
  }

  return (
    <div className="flex justify-center">
      <motion.button
        type="button"
        className="relative w-28 h-28 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
        onClick={() => inputRef.current?.click()}
        aria-label="Enviar foto do grupo"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <AnimatePresence mode="wait">
          {previewUrl && value ? (
            <motion.img
              key="preview"
              src={previewUrl}
              alt="Preview da foto do grupo"
              className="w-28 h-28 rounded-full object-cover border-2 border-border"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            />
          ) : (
            <motion.div
              key="placeholder"
              className="w-28 h-28 rounded-full border-2 border-dashed border-muted-foreground/50 bg-muted flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <span className="text-4xl" aria-hidden="true">
                📚
              </span>
            </motion.div>
          )}
        </AnimatePresence>
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
      </motion.button>
    </div>
  );
}
