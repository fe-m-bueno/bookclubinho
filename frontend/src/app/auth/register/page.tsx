"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { motion } from "framer-motion";

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
import { useAuthSubmit } from "@/hooks/use-auth-submit";
import { useResendCooldown } from "@/hooks/use-resend-cooldown";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const registerSchema = z
  .object({
    display_name: z.string().min(1, "Nome é obrigatório"),
    email: z.string().min(1, "E-mail é obrigatório").email("E-mail inválido"),
    password: z.string().min(8, "Mínimo de 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirme sua senha"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const { remaining, start: startCooldown } = useResendCooldown();

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      display_name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const { submit: submitRegister, loading } = useAuthSubmit({
    url: `${API_URL}/api/v1/auth/register`,
    onSuccess: () => {
      setSubmittedEmail(form.getValues("email"));
      setSubmitted(true);
    },
    statusHandlers: [
      {
        status: 422,
        handler: async (res) => {
          const body = await res.json();
          toast.error(body.detail || "Erro de validação");
        },
      },
    ],
  });

  const { submit: submitResend, loading: resendLoading } = useAuthSubmit({
    url: `${API_URL}/api/v1/auth/resend-verification`,
    onSuccess: () => {
      toast.success("E-mail reenviado!");
      startCooldown();
    },
    antiEnumeration: true,
  });

  async function onSubmit(data: RegisterFormData) {
    await submitRegister(
      JSON.stringify({
        display_name: data.display_name,
        email: data.email,
        password: data.password,
      })
    );
  }

  async function handleResend() {
    await submitResend(JSON.stringify({ email: submittedEmail }));
  }

  return (
    <Card className="max-w-sm w-full">
      {!submitted ? (
        <>
          <CardHeader className="text-center space-y-1">
            <p className="text-4xl" aria-hidden="true">
              📚
            </p>
            <h1 className="text-2xl font-bold tracking-tight">Criar conta</h1>
            <p className="text-sm text-muted-foreground">
              Junte-se ao clube
            </p>
          </CardHeader>

          <CardContent>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                label="Nome"
                htmlFor="register-name"
                error={form.formState.errors.display_name?.message}
              >
                <Input
                  id="register-name"
                  type="text"
                  placeholder="Seu nome"
                  autoComplete="name"
                  {...form.register("display_name")}
                />
              </FormField>

              <FormField
                label="E-mail"
                htmlFor="register-email"
                error={form.formState.errors.email?.message}
              >
                <Input
                  id="register-email"
                  type="email"
                  placeholder="seu@email.com"
                  autoComplete="email"
                  {...form.register("email")}
                />
              </FormField>

              <FormField
                label="Senha"
                htmlFor="register-password"
                error={form.formState.errors.password?.message}
              >
                <PasswordInput
                  id="register-password"
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  showLabel="Mostrar senha"
                  hideLabel="Ocultar senha"
                  {...form.register("password")}
                />
              </FormField>

              <FormField
                label="Confirmar senha"
                htmlFor="register-confirm-password"
                error={form.formState.errors.confirmPassword?.message}
              >
                <PasswordInput
                  id="register-confirm-password"
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  showLabel="Mostrar confirmação de senha"
                  hideLabel="Ocultar confirmação de senha"
                  {...form.register("confirmPassword")}
                />
              </FormField>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Criar conta"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="justify-center">
            <p className="text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link
                href="/auth/login"
                className="text-foreground font-medium hover:underline"
              >
                Entrar
              </Link>
            </p>
          </CardFooter>
        </>
      ) : (
        <>
          <CardHeader className="text-center space-y-4">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="flex justify-center"
            >
              <Mail className="h-16 w-16 text-primary" />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight">
              Verifique seu e-mail
            </h1>
            <p className="text-sm text-muted-foreground">
              Enviamos um link de verificação para{" "}
              <strong className="text-foreground">{submittedEmail}</strong>
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-11 cursor-pointer"
              onClick={handleResend}
              disabled={remaining > 0 || resendLoading}
            >
              {resendLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : remaining > 0 ? (
                `Reenviar em ${remaining}s`
              ) : (
                "Reenviar e-mail"
              )}
            </Button>

            <div className="text-center">
              <Link
                href="/auth/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar para o login
              </Link>
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
