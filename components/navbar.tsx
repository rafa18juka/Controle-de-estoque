"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, ScanLine, BarChart2, Package, LogOut, History } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAuthPage = pathname === "/login";

  const links = useMemo(() => {
    if (!user) return [] as Array<{ href: string; label: string; icon: ReactNode }>;
    const base = [
      { href: "/scan", label: "Escanear", icon: <ScanLine size={16} /> },
      { href: "/history", label: "Historico", icon: <History size={16} /> }
    ];
    if (user.role === "admin") {
      base.push(
        { href: "/admin/dashboard", label: "Dashboard", icon: <BarChart2 size={16} /> },
        { href: "/admin/estoque", label: "Estoque", icon: <Package size={16} /> }
      );
    }
    return base;
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };

  if (isAuthPage) {
    return null;
  }

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="container mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={user?.role === "admin" ? "/admin/dashboard" : "/scan"} className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-white">
            Mustafar Variedades
          </span>
        </Link>
        {user ? (
          <nav className="hidden items-center gap-3 md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  pathname.startsWith(link.href)
                    ? "bg-slate-900 text-white shadow"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
            <Button variant="outline" onClick={handleSignOut} className="gap-2">
              <LogOut size={16} />
              Sair
            </Button>
          </nav>
        ) : (
          <div className="text-sm text-slate-500">{loading ? "Conectando..." : ""}</div>
        )}

        {user ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full bg-slate-100 p-2 text-slate-600 transition hover:bg-slate-200 md:hidden"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <Menu size={18} />
          </button>
        ) : null}
      </div>
      {user && menuOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                  pathname.startsWith(link.href)
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
                onClick={() => setMenuOpen(false)}
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
            <Button variant="outline" onClick={handleSignOut} className="w-full justify-center gap-2">
              <LogOut size={16} />
              Sair
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
