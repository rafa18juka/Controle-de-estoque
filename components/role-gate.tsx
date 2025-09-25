"use client";

import { useAuth } from "@/components/providers/auth-provider";
import type { UserRole } from "@/lib/types";
import type { ReactNode } from "react";

interface RoleGateProps {
  allow: UserRole[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGate({ allow, fallback, children }: RoleGateProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-slate-500">
        Verificando permissões…
      </div>
    );
  }

  if (!user || !allow.includes(user.role)) {
    return (
      fallback ?? (
        <div className="card text-center text-sm text-slate-500">
          Você não tem permissão para acessar esta área.
        </div>
      )
    );
  }

  return <>{children}</>;
}
