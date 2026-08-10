"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupCodeCheck } from "@/hooks/use-group-code-check";
import { useAuthSubmit } from "@/hooks/use-auth-submit";

function JoinGroupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const code =
    searchParams.get("code")?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";

  const { status, group } = useGroupCodeCheck(code, 0);

  const { submit, loading: joining } = useAuthSubmit<{ group_id: string }>({
    path: "/groups/join",
    onSuccess: async (data) => {
      router.push(`/groups/${data.group_id}`);
    },
    statusHandlers: [
      {
        status: 401,
        handler: () =>
          router.push(
            `/auth/login?redirect=${encodeURIComponent(`/groups/join?code=${code}`)}`,
          ),
      },
      { status: 409, handler: () => router.push("/") },
      { status: 403, handler: () => {} },
      { status: 404, handler: () => {} },
    ],
  });

  if (!code) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            Código de convite não informado.
          </p>
          <Button variant="outline" onClick={() => router.push("/")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  const isLoading = status === "idle" || status === "checking";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {isLoading && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="type-meta">
              Verificando convite...
            </p>
          </div>
        )}

        {status === "valid" && group && (
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              {group.photo_url ? (
                <Image
                  src={group.photo_url}
                  alt={group.name}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-2xl object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold">
                  {group.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <h1 className="text-xl font-semibold">{group.name}</h1>
              <p className="type-meta flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {group.member_count} membro
                {group.member_count !== 1 ? "s" : ""}
              </p>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={() => submit({ invite_code: code })}
              disabled={joining}
            >
              {joining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar no clube"
              )}
            </Button>

            {/* A entrada de maior valor para a /about: esta tela renderiza
                deslogada, então quem recebeu o convite decide se cria conta
                olhando para o nome de um clube que não conhece e nada mais. */}
            <Link
              href="/about"
              className="type-meta inline-flex min-h-11 items-center rounded-lg px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              o que é o bookclubinho?
            </Link>
          </div>
        )}

        {status === "not_found" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Convite inválido ou clube não encontrado.
            </p>
            <Button variant="outline" onClick={() => router.push("/")}>
              Voltar ao início
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Erro ao carregar grupo. Tente novamente.
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Tentar novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function JoinGroupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <JoinGroupContent />
    </Suspense>
  );
}
