"use client";

import { useCallback, useRef, useState } from "react";
import { ensureCsrf, withCsrf } from "@/lib/csrf";
import { useChatStore } from "@/stores/chat-store";
import type { MediaUploadResponse } from "@/lib/types/chat";

interface UseMediaUploadReturn {
  upload: (file: File) => Promise<MediaUploadResponse>;
  progress: number | null;
  uploading: boolean;
  error: string | null;
  cancel: () => void;
}

export function useMediaUpload(groupId: string): UseMediaUploadReturn {
  const [progress, setProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (file: File): Promise<MediaUploadResponse> => {
      setError(null);
      setUploading(true);
      setProgress(0);
      useChatStore.getState().setUploadProgress(0);

      await ensureCsrf();
      const csrfHeaders = withCsrf();

      return new Promise<MediaUploadResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setProgress(pct);
            useChatStore.getState().setUploadProgress(pct);
          }
        });

        xhr.addEventListener("load", () => {
          setUploading(false);
          setProgress(null);
          useChatStore.getState().setUploadProgress(null);
          xhrRef.current = null;

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Resposta inválida do servidor"));
            }
          } else {
            try {
              const data = JSON.parse(xhr.responseText);
              const msg = data.detail || "Erro ao fazer upload";
              setError(msg);
              reject(new Error(msg));
            } catch {
              setError("Erro ao fazer upload");
              reject(new Error("Erro ao fazer upload"));
            }
          }
        });

        xhr.addEventListener("error", () => {
          setUploading(false);
          setProgress(null);
          useChatStore.getState().setUploadProgress(null);
          xhrRef.current = null;
          setError("Erro de conexão no upload");
          reject(new Error("Erro de conexão no upload"));
        });

        xhr.addEventListener("abort", () => {
          setUploading(false);
          setProgress(null);
          useChatStore.getState().setUploadProgress(null);
          xhrRef.current = null;
        });

        const formData = new FormData();
        formData.append("file", file);

        xhr.open("POST", `/api/v1/groups/${groupId}/media/upload`);
        xhr.withCredentials = true;
        for (const [key, value] of Object.entries(csrfHeaders)) {
          xhr.setRequestHeader(key, value);
        }
        xhr.send(formData);
      });
    },
    [groupId],
  );

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
  }, []);

  return { upload, progress, uploading, error, cancel };
}
