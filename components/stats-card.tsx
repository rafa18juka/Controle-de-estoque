import { useMemo } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string;
  description?: string;
  accent?: "default" | "success" | "danger";
  className?: string;
}

const accents = {
  default: {
    borderGradient:
      "conic-gradient(from 0deg at 50% 50%, rgba(34,211,238,0.6), rgba(167,139,250,0.6), rgba(244,114,182,0.6), rgba(245,158,11,0.6), rgba(34,211,238,0.6))",
    innerGlow:
      "radial-gradient(60% 60% at 50% 18%, rgba(167,139,250,0.08), transparent 60%)",
    shadow: "shadow-[0_30px_120px_-45px_rgba(56,189,248,0.55)]",
    label: "text-slate-200/70",
    valueGradient: "bg-gradient-to-r from-cyan-200 via-fuchsia-200 to-amber-200",
    description: "text-slate-200/70",
    barGradient:
      "linear-gradient(90deg, rgba(34,211,238,0.8), rgba(167,139,250,0.8), rgba(244,114,182,0.85))",
    particleColor: "rgba(34,211,238,0.75)",
    barShadow: "0 0 16px rgba(34,211,238,0.45)"
  },
  success: {
    borderGradient:
      "conic-gradient(from 0deg at 50% 50%, rgba(45,212,191,0.6), rgba(34,197,94,0.6), rgba(56,189,248,0.6), rgba(45,212,191,0.6))",
    innerGlow:
      "radial-gradient(58% 58% at 50% 20%, rgba(45,212,191,0.08), transparent 60%)",
    shadow: "shadow-[0_30px_120px_-45px_rgba(16,185,129,0.55)]",
    label: "text-emerald-100/70",
    valueGradient: "bg-gradient-to-r from-emerald-200 via-teal-200 to-lime-200",
    description: "text-emerald-100/75",
    barGradient:
      "linear-gradient(90deg, rgba(45,212,191,0.85), rgba(56,189,248,0.8), rgba(59,130,246,0.75))",
    particleColor: "rgba(16,185,129,0.7)",
    barShadow: "0 0 16px rgba(16,185,129,0.45)"
  },
  danger: {
    borderGradient:
      "conic-gradient(from 0deg at 50% 50%, rgba(244,114,182,0.65), rgba(250,204,21,0.55), rgba(236,72,153,0.65), rgba(244,63,94,0.6), rgba(244,114,182,0.65))",
    innerGlow:
      "radial-gradient(60% 60% at 50% 20%, rgba(244,114,182,0.1), transparent 65%)",
    shadow: "shadow-[0_30px_120px_-45px_rgba(236,72,153,0.55)]",
    label: "text-rose-100/75",
    valueGradient: "bg-gradient-to-r from-rose-200 via-amber-200 to-pink-200",
    description: "text-rose-100/70",
    barGradient:
      "linear-gradient(90deg, rgba(244,114,182,0.85), rgba(250,204,21,0.75), rgba(244,63,94,0.82))",
    particleColor: "rgba(244,114,182,0.7)",
    barShadow: "0 0 16px rgba(236,72,153,0.45)"
  }
} as const;

export function StatsCard({ label, value, description, accent = "default", className }: StatsCardProps) {
  const style = accents[accent];
  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        top: Math.random() * 100,
        duration: 2.8 + index * 0.25,
        delay: index * 0.18
      })),
    []
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("relative overflow-hidden rounded-[32px]", className)}
    >
      <motion.div
        className="absolute inset-0 rounded-[30px]"
        style={{ background: style.borderGradient }}
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <div className={cn("relative m-[3px] h-full overflow-hidden rounded-[26px] bg-slate-950/95 p-6 backdrop-blur-lg", style.shadow)}>
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[26px]"
          style={{ background: style.innerGlow }}
          animate={{ opacity: [0.45, 0.8, 0.45] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.08),transparent_45%)]" />

        <div className="pointer-events-none absolute inset-0">
          {particles.map((particle) => (
            <motion.span
              key={particle.id}
              className="absolute h-1 w-1 rounded-full"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                background: `radial-gradient(circle, ${style.particleColor}, rgba(255,255,255,0) 70%)`
              }}
              animate={{ y: [0, -8, 0], opacity: [0.2, 0.7, 0.2] }}
              transition={{ duration: particle.duration, delay: particle.delay, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
        </div>

        <div className="relative z-10 flex flex-col gap-3">
          <span className={cn("text-[10px] font-semibold uppercase tracking-[0.32em]", style.label)}>{label}</span>
          <span className={cn("text-3xl font-black leading-tight tracking-tight text-transparent drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] md:text-[2.6rem]", style.valueGradient, "bg-clip-text")}>
            {value}
          </span>
          {description ? <span className={cn("text-xs font-medium", style.description)}>{description}</span> : null}

          <motion.div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              className="h-full rounded-full"
              style={{ background: style.barGradient, boxShadow: style.barShadow }}
            />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
