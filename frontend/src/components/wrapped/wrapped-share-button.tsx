"use client";

import type { RefObject } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface WrappedShareButtonProps {
  slideRef: RefObject<HTMLDivElement | null>;
  slideNumber: number;
  year: number;
}

export function WrappedShareButton({ slideRef, slideNumber, year }: WrappedShareButtonProps) {
  async function handleShare() {
    if (!slideRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(slideRef.current, { useCORS: true, scale: 2 });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Erro ao gerar imagem.");
          return;
        }
        const filename = `wrapped-${year}-slide-${slideNumber}.png`;
        const file = new File([blob], filename, { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: `Wrapped ${year}` });
          } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") return;
            downloadBlob(blob, filename);
          }
        } else {
          downloadBlob(blob, filename);
        }
      });
    } catch {
      toast.error("Erro ao gerar imagem para compartilhar.");
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="gap-2 opacity-80 hover:opacity-100"
      onClick={handleShare}
    >
      <Share2 className="h-4 w-4" />
      Compartilhar
    </Button>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
