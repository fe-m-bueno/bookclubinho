"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ensureCsrf, withCsrf } from "@/lib/csrf";

type Status = "loading" | "success" | "error-expired" | "error-invalid";

const STATUS_CONFIG = {
  "error-expired": { heading: "Link expirado ou inválido" },
  "error-invalid": { heading: "Link inválido" },
} as const;

const resultMotionProps = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.25 },
} as const;

function AnimatedStatusIcon({ variant }: { variant: "success" | "error" }) {
  const color = variant === "success" ? "text-green-500" : "text-red-500";
  const pathD =
    variant === "success" ? "M15 27l7 7 15-15" : "M17 17l18 18M35 17l-18 18";

  return (
    <svg
      className="h-20 w-20"
      viewBox="0 0 52 52"
      fill="none"
      aria-hidden="true"
    >
      <motion.circle
        cx="26"
        cy="26"
        r="24"
        stroke="currentColor"
        strokeWidth="2"
        className={color}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
      <motion.path
        d={pathD}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={color}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, delay: 0.3, ease: "easeOut" }}
      />
    </svg>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [countdown, setCountdown] = useState(3);
  const hasVerified = useRef(false);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      toast.error("Link inválido");
      router.replace("/auth/login");
      return;
    }

    if (hasVerified.current) return;
    hasVerified.current = true;

    async function verify() {
      try {
        await ensureCsrf();
        const res = await fetch(
          `/api/v1/auth/verify-email?token=${encodeURIComponent(token!)}`,
          { method: "POST", headers: withCsrf(), credentials: "include" }
        );

        if (res.ok) {
          setStatus("success");
        } else if (res.status === 400) {
          setStatus("error-expired");
        } else {
          setStatus("error-invalid");
        }
      } catch {
        setStatus("error-invalid");
      }
    }

    verify();
  }, [searchParams, router]);

  useEffect(() => {
    if (status !== "success") return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          // Schedule redirect outside of updater to avoid side effects in render
          queueMicrotask(() => router.push("/auth/login"));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [status, router]);

  const isError = status === "error-expired" || status === "error-invalid";

  return (
    <Card className="max-w-sm w-full">
      <AnimatePresence mode="wait">
        {status === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardHeader className="text-center space-y-4 py-12">
              <div className="flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Verificando seu email...</p>
            </CardHeader>
          </motion.div>
        )}

        {status === "success" && (
          <motion.div key="success" {...resultMotionProps}>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                <AnimatedStatusIcon variant="success" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                Email verificado!
              </h1>
              <p className="text-sm text-muted-foreground">
                Sua conta está pronta.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Redirecionando em {countdown}...
              </p>
              <Button asChild className="w-full h-11">
                <Link href="/auth/login">Ir para login</Link>
              </Button>
            </CardContent>
          </motion.div>
        )}

        {isError && (
          <motion.div key="error" {...resultMotionProps}>
            <CardHeader className="text-center space-y-4">
              <div className="flex justify-center">
                <AnimatedStatusIcon variant="error" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">
                {STATUS_CONFIG[status].heading}
              </h1>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild variant="outline" className="w-full h-11">
                <Link href="/auth/register">Reenviar verificação</Link>
              </Button>
              <div className="text-center">
                <Link
                  href="/auth/register"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Voltar para cadastro
                </Link>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
