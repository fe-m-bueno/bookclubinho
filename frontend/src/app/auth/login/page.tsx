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
import { Separator } from "@/components/ui/separator";
import { FormField } from "@/components/auth/form-field";
import { GoogleIcon } from "@/components/icons/google-icon";
import { useAuthSubmit, FORM_HEADERS } from "@/hooks/use-auth-submit";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

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
    url: `${API_URL}/api/v1/auth/login`,
    headers: FORM_HEADERS,
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
    url: `${API_URL}/api/v1/auth/magic-link`,
    onSuccess: () => toast.success("Link enviado! Verifique seu e-mail."),
    antiEnumeration: true,
  });

  function toggleMode() {
    if (mode === "password") {
      magicForm.setValue("email", loginForm.getValues("email"));
      setMode("magic");
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
    await submitMagic(JSON.stringify({ email: data.email }));
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
          <h1 className="text-2xl font-bold tracking-tight">
            Bem-vindo de volta
          </h1>
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para continuar
          </p>
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
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  {...loginForm.register("password")}
                />
              </FormField>

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

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              ou
            </span>
          </div>

          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => {
              window.location.href = `${API_URL}/api/v1/auth/google/login`;
            }}
            type="button"
          >
            <GoogleIcon className="h-4 w-4 mr-2" />
            Entrar com Google
          </Button>

          <button
            type="button"
            onClick={toggleMode}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {mode === "password"
              ? "Entrar com link mágico"
              : "Entrar com senha"}
          </button>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
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
