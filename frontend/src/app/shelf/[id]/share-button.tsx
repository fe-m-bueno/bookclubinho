"use client";

import { useEffect, useRef, useState } from "react";
import { Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  shelfId: string;
  label?: string;
}

export function ShareButton({ shelfId, label = "Compartilhar" }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  async function handleShare() {
    const url = `${window.location.origin}/shelf/${shelfId}`;
    await navigator.clipboard.writeText(url);
    clearTimeout(timeoutRef.current);
    setCopied(true);
    timeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="gap-1.5 shrink-0"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
      {copied ? "Copiado!" : label}
    </Button>
  );
}
