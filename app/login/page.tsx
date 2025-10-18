"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido"),
  password: z.string().min(6, "Sua senha deve ter pelo menos 6 caracteres")
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const router = useRouter();
  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting }
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema)
  });

  useEffect(() => {
    if (user) {
      router.replace(user.role === "admin" ? "/admin/dashboard" : "/tasks");
    }
  }, [user, router]);

  const onSubmit = async (values: LoginValues) => {
    try {
      await signIn(values.email, values.password);
      toast.success("Login realizado com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Credenciais inválidas. Tente novamente.");
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-card dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-2 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Mustafar Variedades
        </span>
        <h1 className="text-2xl font-bold text-slate-900">Controle de Estoque</h1>
        <p className="text-sm text-slate-500">Entre com seu e-mail corporativo e senha para acessar o painel.</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" placeholder="voce@mustafar.com" type="email" autoComplete="email" {...register("email")} />
          {errors.email ? <p className="text-sm text-red-500">{errors.email.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password ? <p className="text-sm text-red-500">{errors.password.message}</p> : null}
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting || loading}>
          {isSubmitting ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-xs text-slate-400">
          Use conexões seguras (HTTPS) para liberar a câmera em dispositivos móveis.
        </p>
      </form>
    </div>
  );
}
