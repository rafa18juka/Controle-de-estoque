"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-provider";
import { useTheme } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
        <ThemeAwareToaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

function ThemeAwareToaster() {
  const { theme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = theme === "system" ? systemTheme : theme;
  const themeValue = !mounted ? "light" : activeTheme === "dark" ? "dark" : "light";

  return <Toaster richColors closeButton position="top-right" theme={themeValue as "light" | "dark"} />;
}
