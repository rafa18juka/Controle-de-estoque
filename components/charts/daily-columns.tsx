"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from "recharts";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface DailyColumnPoint {
  name: string;
  label?: string | null;
  value: number;
  quantity?: number;
}

interface DailyColumnsChartProps {
  data: DailyColumnPoint[];
  title?: string;
  className?: string;
  emptyMessage?: string;
  headerActions?: ReactNode;
  valueFormatter?: (value: number) => string;
}

const DEFAULT_EMPTY_MESSAGE = "Sem dados para exibir.";

export function DailyColumnsChart({
  data,
  title,
  className,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  headerActions,
  valueFormatter = currency
}: DailyColumnsChartProps) {
  const hasData = useMemo(() => data.some((point) => point.value > 0), [data]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-purple-500/20 dark:bg-slate-900/50",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/10 to-cyan-500/10 dark:from-purple-500/20 dark:via-indigo-600/10 dark:to-cyan-500/20" />
      <div className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-36 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 space-y-6">
        {(title ?? headerActions) ? (
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {title ? (
              <h3 className="text-base font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {title}
              </h3>
            ) : (
              <span />
            )}
            {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
          </header>
        ) : null}

        <div className="h-[320px] w-full">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 16, right: 12, left: -4, bottom: 0 }}>
                <defs>
                  <linearGradient id="cosmicColumnGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.85} />
                    <stop offset="45%" stopColor="#3b82f6" stopOpacity={0.85} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.3} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" stroke="#cbd5f5" opacity={0.25} vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveEnd"
                  minTickGap={16}
                />
                <YAxis
                  tickFormatter={(value: number) => valueFormatter(value)}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<DailyColumnsTooltip valueFormatter={valueFormatter} />} cursor={{ fill: "rgba(139, 92, 246, 0.08)" }} />
                <Bar
                  dataKey="value"
                  fill="url(#cosmicColumnGradient)"
                  radius={[12, 12, 0, 0]}
                  maxBarSize={38}
                  animationDuration={800}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300/60 text-sm text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type BarTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: DailyColumnPoint }>;
  label?: string;
  valueFormatter: (value: number) => string;
};

function DailyColumnsTooltip({
  active,
  payload,
  label,
  valueFormatter
}: BarTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const datum = payload[0].payload as DailyColumnPoint;

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {datum.label ?? label}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
        {valueFormatter(datum.value)}
      </p>
      {typeof datum.quantity === "number" ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {datum.quantity.toLocaleString("pt-BR")} itens
        </p>
      ) : null}
    </div>
  );
}
