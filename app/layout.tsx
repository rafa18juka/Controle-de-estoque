import "./globals.css";

import type { Metadata } from "next";
import { PropsWithChildren } from "react";

import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers/providers";

export const metadata: Metadata = {
  title: "Mustafar Variedades – Controle de Estoque",
  description:
    "Aplicativo de controle de estoque para o e-commerce Mustafar Variedades com scanner de código de barras e dashboard em tempo real."
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          <Navbar />
          <main className="container mx-auto w-full max-w-6xl px-4 pb-16 pt-24">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
