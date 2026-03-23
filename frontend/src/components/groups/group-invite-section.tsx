"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Download, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { formatInviteCode } from "@/lib/format-invite-code";
import type { GroupDetailResponse } from "@/lib/types/group";

interface GroupInviteSectionProps {
  group: GroupDetailResponse;
  refetch: () => void;
}

export function GroupInviteSection({ group, refetch }: GroupInviteSectionProps) {
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const formattedCode = group.invite_code
    ? formatInviteCode(group.invite_code)
    : "";

  const joinUrl = useMemo(
    () =>
      group.invite_code
        ? `${window.location.origin}/groups/join?code=${group.invite_code.replace(/-/g, "")}`
        : "",
    [group.invite_code],
  );

  const { submit: regenerate, loading: regenerating } = useAuthSubmit({
    url: `/api/v1/groups/${group.id}/regenerate-code`,
    method: "POST",
    onSuccess: () => {
      toast.success("Código regenerado!");
      setConfirmRegenerate(false);
      refetch();
    },
  });

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      setCopied(true);
      toast.success("Código copiado!");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }, [formattedCode]);

  const handleDownloadQr = useCallback(() => {
    const svgEl = qrRef.current?.querySelector("svg");
    if (!svgEl) return;

    const canvas = document.createElement("canvas");
    const size = 320;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const link = document.createElement("a");
      link.download = `${group.name.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.onerror = () => toast.error("Falha ao gerar imagem do QR.");
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  }, [group.name]);

  if (!group.invite_code) return null;

  return (
    <div className="bg-card rounded-2xl shadow-warm-sm p-5 space-y-5">
      <h3 className="font-semibold">Código de convite</h3>

      <div className="flex items-center justify-center gap-3">
        <div className="inline-flex items-center gap-3 rounded-lg border bg-muted px-5 py-3">
          <span className="font-mono text-2xl font-bold tracking-widest">
            {formattedCode}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variant="outline" className="h-10" onClick={handleCopy}>
          {copied ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copied ? "Copiado!" : "Copiar código"}
        </Button>

        {confirmRegenerate ? (
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="h-10"
              disabled={regenerating}
              onClick={() => regenerate("")}
            >
              {regenerating ? "Regenerando..." : "Confirmar"}
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => setConfirmRegenerate(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => setConfirmRegenerate(true)}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Regenerar
          </Button>
        )}
      </div>

      {joinUrl && (
        <div className="flex flex-col items-center gap-3">
          <div ref={qrRef} className="rounded-xl border bg-white p-3">
            <QRCodeSVG value={joinUrl} size={160} level="M" />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleDownloadQr}
          >
            <Download className="mr-2 h-4 w-4" />
            Baixar QR
          </Button>
        </div>
      )}
    </div>
  );
}
