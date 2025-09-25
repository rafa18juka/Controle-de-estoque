"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ensureFirebase,
  fetchUserRole,
  onAuthChanged,
  signIn as firebaseSignIn,
  signOut as firebaseSignOut,
  upsertUser
} from "@/lib/firebase-client";
import type { AppUser } from "@/lib/types";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  firebaseReady: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  reloadUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [firebaseReady, setFirebaseReady] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    const init = async () => {
      try {
        await ensureFirebase();
        setFirebaseReady(true);
        unsubscribe = await onAuthChanged(async (firebaseUser) => {
          if (!active) return;
          if (!firebaseUser) {
            setUser(null);
            setLoading(false);
            return;
          }

          try {
            const userDoc = await fetchUserRole(firebaseUser.uid);
            const role = userDoc?.role ?? "staff";
            if (!userDoc) {
              await upsertUser(firebaseUser, role);
            }
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? "",
              displayName: firebaseUser.displayName ?? firebaseUser.email ?? "",
              role
            });
          } catch (error) {
            console.error("Erro ao carregar dados do usuário", error);
            toast.error("Não foi possível carregar o perfil do usuário");
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email ?? "",
              displayName: firebaseUser.displayName ?? firebaseUser.email ?? "",
              role: "staff"
            });
          }
          setLoading(false);
        });
      } catch (error) {
        console.error("Erro ao inicializar Firebase", error);
        toast.error("Falha ao inicializar o Firebase. Verifique as variáveis de ambiente.");
        setLoading(false);
      }
    };

    init();

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const reloadUser = useCallback(async () => {
    if (!user) return;
    const userDoc = await fetchUserRole(user.uid);
    if (userDoc) {
      setUser(userDoc);
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseReady,
      signIn: async (email, password) => {
        await firebaseSignIn(email, password);
      },
      signOut: async () => {
        await firebaseSignOut();
        setUser(null);
      },
      reloadUser
    }),
    [user, loading, firebaseReady, reloadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return context;
}
