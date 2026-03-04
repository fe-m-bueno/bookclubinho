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
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

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
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [loadingMagic, setLoadingMagic] = useState(false);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const magicForm = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: "" },
  });

  function toggleMode() {
    if (mode === "password") {
      const email = loginForm.getValues("email");
      magicForm.setValue("email", email);
      setMode("magic");
    } else {
      const email = magicForm.getValues("email");
      loginForm.setValue("email", email);
      setMode("password");
    }
  }

  async function onLoginSubmit(data: LoginFormData) {
    setLoadingPassword(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: data.email,
          password: data.password,
        }),
        credentials: "include",
      });

      if (res.ok) {
        router.push("/");
        return;
      }

      if (res.status === 401) {
        toast.error("Credenciais inválidas");
      } else if (res.status === 403) {
        toast.error("Confirme seu e-mail antes de entrar");
      } else if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
      } else {
        toast.error("Erro ao entrar. Tente novamente.");
      }
    } catch {
      toast.error("Erro de conexão. Verifique sua internet.");
    } finally {
      setLoadingPassword(false);
    }
  }

  async function onMagicSubmit(data: MagicLinkFormData) {
    setLoadingMagic(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
        credentials: "include",
      });

      if (res.ok) {
        toast.success("Link enviado! Verifique seu e-mail.");
      } else if (res.status === 429) {
        toast.error("Muitas tentativas. Aguarde um momento.");
      } else {
        toast.success("Link enviado! Verifique seu e-mail.");
      }
    } catch {
      toast.error("Erro de conexão. Verifique sua internet.");
    } finally {
      setLoadingMagic(false);
    }
  }

  function handleGoogleLogin() {
    window.location.href = `${API_URL}/api/v1/auth/google/login`;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

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
              <div className="space-y-2">
                <Label htmlFor="login-email">E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  {...loginForm.register("email")}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Sua senha"
                  autoComplete="current-password"
                  {...loginForm.register("password")}
                />
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {loginForm.formState.errors.password.message}
                  </p>
                )}
              </div>

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
              <div className="space-y-2">
                <Label htmlFor="magic-email">E-mail</Label>
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  {...magicForm.register("email")}
                />
                {magicForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {magicForm.formState.errors.email.message}
                  </p>
                )}
              </div>

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
            onClick={handleGoogleLogin}
            type="button"
          >
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
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
    </div>
  );
}
