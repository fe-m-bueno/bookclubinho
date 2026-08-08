"use client";

import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { FormField } from "@/components/auth/form-field";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleIcon } from "@/components/icons/google-icon";
import { useAuthSubmit } from "@/hooks/use-auth-submit";

const loginSchema = z.object({
  email: z.string().min(1, "E-mail é obrigatório").email("E-mail inválido"),
  password: z.string().min(1, "Senha é obrigatória"),
});

const magicLinkSchema = z.object({
  email: z.string().min(1, "E-mail é obrigatório").email("E-mail inválido"),
});

type LoginFormData = z.infer<typeof loginSchema>;
type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

function OAuthErrorToast() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error") === "oauth_failed") {
      toast.error("Falha ao entrar com Google. Tente novamente.");
    }
  }, [searchParams]);

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "magic">("password");

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const magicForm = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  const { submit: submitLogin, loading: loadingPassword } = useAuthSubmit({
    path: "/auth/login",
    onSuccess: () => router.push("/"),
    statusHandlers: [
      { status: 401, handler: () => toast.error("Credenciais inválidas") },
      {
        status: 403,
        handler: () => toast.error("Confirme seu e-mail antes de entrar"),
      },
    ],
  });

  const { submit: submitMagic, loading: loadingMagic } = useAuthSubmit({
    path: "/auth/magic-link",
    onSuccess: () => toast.success("Link enviado! Verifique seu e-mail."),
    antiEnumeration: true,
  });

  function goToMagicLink() {
    magicForm.setValue("email", loginForm.getValues("email"));
    setMode("magic");
  }

  function toggleMode() {
    if (mode === "password") {
      goToMagicLink();
    } else {
      loginForm.setValue("email", magicForm.getValues("email"));
      setMode("password");
    }
  }

  async function onLoginSubmit(data: LoginFormData) {
    await submitLogin(
      new URLSearchParams({ username: data.email, password: data.password })
    );
  }

  async function onMagicSubmit(data: MagicLinkFormData) {
    await submitMagic({ email: data.email });
  }

  return (
    <>
      <Suspense>
        <OAuthErrorToast />
      </Suspense>

      <Card className="max-w-sm w-full">
        <CardHeader className="text-center space-y-1">
          <p className="text-4xl" aria-hidden="true">
            📚
          </p>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Bem-vindo de volta
          </h1>
          <p className="type-meta">Entre na sua conta para continuar</p>
        </CardHeader>

        <CardContent className="space-y-4">
          {mode === "password" ? (
            <form
              onSubmit={loginForm.handleSubmit(onLoginSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                label="E-mail"
                htmlFor="login-email"
                error={loginForm.formState.errors.email?.message}
              >
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  {...loginForm.register("email")}
                />
              </FormField>

              <FormField
                label="Senha"
                htmlFor="login-password"
                error={loginForm.formState.errors.password?.message}
              >
                <PasswordInput
                  id="login-password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  {...loginForm.register("password")}
                />
              </FormField>

              {/* Não há reset de senha no backend — a recuperação é o próprio
                  magic link, que "Entrar com link mágico" não comunica. */}
              <button
                type="button"
                onClick={goToMagicLink}
                className="type-meta -mt-2 block hover:text-foreground transition-colors"
              >
                Esqueci minha senha
              </button>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={loadingPassword}
              >
                {loadingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          ) : (
            <form
              onSubmit={magicForm.handleSubmit(onMagicSubmit)}
              className="space-y-4"
              noValidate
            >
              <p className="type-meta">
                Informe seu e-mail e mandamos um link de acesso. Você entra sem
                precisar de senha.
              </p>

              <FormField
                label="E-mail"
                htmlFor="magic-email"
                error={magicForm.formState.errors.email?.message}
              >
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  {...magicForm.register("email")}
                />
              </FormField>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={loadingMagic}
              >
                {loadingMagic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Enviar link mágico"
                )}
              </Button>
            </form>
          )}

          <div className="divider-ornament">
            <span>ou</span>
          </div>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              // `/api/v1/*` é rewrite para o FastAPI, não rota do Next: o
              // destino real é o consentimento do Google, fora da origem. O
              // router do Next tentaria resolver como página e não sairia do
              // lugar — aqui a navegação de documento é a correta.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              window.location.assign("/api/v1/auth/google/login");
            }}
            type="button"
          >
            <GoogleIcon className="h-4 w-4 mr-2" />
            Entrar com Google
          </Button>

          <button
            type="button"
            onClick={toggleMode}
            className="type-meta w-full text-center hover:text-foreground transition-colors"
          >
            {mode === "password"
              ? "Entrar com link mágico"
              : "Entrar com senha"}
          </button>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="type-meta">
            Não tem conta?{" "}
            <Link
              href="/auth/register"
              className="text-foreground font-medium hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </CardFooter>
      </Card>
    </>
  );
}
