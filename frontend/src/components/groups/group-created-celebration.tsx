"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import ReactConfetti from "react-confetti";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Check, Copy, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWindowSize } from "@/hooks/use-window-size";
import { formatInviteCode } from "@/lib/format-invite-code";

interface GroupCreatedCelebrationProps {
  groupId: string;
  groupName: string;
  inviteCode: string;
}

export function GroupCreatedCelebration({
  groupId,
  groupName,
  inviteCode,
}: GroupCreatedCelebrationProps) {
  const router = useRouter();
  const { width, height } = useWindowSize();
  const [copied, setCopied] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const formattedCode = formatInviteCode(inviteCode);

  useEffect(() => {
    setJoinUrl(
      `${window.location.origin}/groups/join?code=${inviteCode.replace(/-/g, "")}`,
    );
  }, [inviteCode]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formattedCode);
      setCopied(true);
      toast.success("Copiado!");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }, [formattedCode]);

  const handleShare = useCallback(async () => {
    const shareData = {
      title: `Entre no clube "${groupName}"`,
      text: `Use o código ${formattedCode} para entrar no meu clube do livro!`,
      url: joinUrl,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        if ((err as DOMException).name !== "AbortError") {
          toast.error("Erro ao compartilhar.");
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(joinUrl);
        toast.success("Link copiado!");
      } catch {
        toast.error("Não foi possível copiar o link.");
      }
    }
  }, [groupName, formattedCode, joinUrl]);

  return (
    <>
      <ReactConfetti
        width={width}
        height={height}
        recycle={false}
        numberOfPieces={200}
        style={{ position: "fixed", top: 0, left: 0, zIndex: 50 }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="space-y-6 text-center"
      >
        <div>
          <h2 className="text-xl font-semibold">Clube criado!</h2>
          <p className="text-muted-foreground mt-1">{groupName}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Código de convite</p>
          <div className="inline-flex items-center gap-3 rounded-lg border bg-muted px-5 py-3">
            <span className="font-mono text-2xl font-bold tracking-widest">
              {formattedCode}
            </span>
          </div>
        </div>

        {joinUrl && (
          <div className="flex justify-center">
            {/* bg-white is intentional — QR codes need high contrast regardless of theme */}
            <div className="rounded-xl border bg-white p-3">
              <QRCodeSVG value={joinUrl} size={160} level="M" />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button
            variant="outline"
            className="h-11 min-w-[160px]"
            onClick={handleCopyCode}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copiado!" : "Copiar código"}
          </Button>

          <Button
            variant="outline"
            className="h-11 min-w-[160px]"
            onClick={handleShare}
          >
            <Share2 className="mr-2 h-4 w-4" />
            Compartilhar
          </Button>
        </div>

        <Button
          className="w-full h-11"
          onClick={() => router.push(`/groups/${groupId}`)}
        >
          Ir para o clube
        </Button>
      </motion.div>
    </>
  );
}
