"use client";

import { type ReactNode, useId, useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";

import { cn } from "@/lib/utils";

export interface ProductsBarDatum {
  name: string;
  value: number;
  helper?: string;
}

export interface ProductsBarChartProps {
  data: ProductsBarDatum[];
  title: string;
  emptyMessage?: string;
  className?: string;
  layout?: "vertical" | "horizontal";
  valueFormatter?: (value: number) => string;
  headerActions?: ReactNode;
  chartHeight?: string;
  xTickAngle?: number;
}

const defaultFormatter = (value: number) => value.toLocaleString("pt-BR");

type BarTooltipPayload = { payload: ProductsBarDatum & { value: number } };
type BarTooltipProps = TooltipProps<number, string> & { payload?: BarTooltipPayload[] };

export function ProductsBarChart({
  data,
  title,
  emptyMessage = "Sem dados para exibir.",
  className,
  layout = "vertical",
  valueFormatter = defaultFormatter,
  headerActions,
  chartHeight,
  xTickAngle
}: ProductsBarChartProps) {
  const gradientId = useId();

  const prepared = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        value: Number(item.value) || 0,
        displayLabel: item.name
      })),
    [data]
  );
  const hasData = prepared.length > 0 && prepared.some((item) => item.value !== 0);
  const heightClass = chartHeight ?? "h-72";
  const baseTickStyle = { fill: "#64748b", fontSize: 12 };
  const xTickStyle =
    layout === "horizontal"
      ? baseTickStyle
      : xTickAngle !== undefined
        ? { ...baseTickStyle, angle: xTickAngle, textAnchor: "end" as const }
        : baseTickStyle;
  const xTickMargin = layout === "horizontal" ? 8 : xTickAngle !== undefined ? 20 : 8;

  const renderTooltip = (props: BarTooltipProps) => {
    const payload = props.payload;
    if (!props.active || !payload?.length) {
      return null;
    }

    const datum = payload[0].payload;

    return (
      <div className="min-w-[200px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{datum.name}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">
          {valueFormatter(datum.value)}
        </p>
        {datum.helper ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{datum.helper}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-purple-500/20 dark:bg-slate-900/50",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/10 to-cyan-500/10 dark:from-purple-500/20 dark:via-indigo-600/10 dark:to-cyan-500/20" />
      <div className="pointer-events-none absolute -top-32 -left-32 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h3>
          {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
        </header>

        <div className={cn(heightClass, "w-full")}>
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={prepared}
                layout={layout === "horizontal" ? "vertical" : "horizontal"}
                margin={{ top: 16, right: 12, bottom: 8, left: 16 }}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.85} />
                    <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.85} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.35} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#cbd5f5"
                  strokeDasharray="4 8"
                  horizontal={layout !== "horizontal"}
                  vertical={false}
                  opacity={0.25}
                />
                {layout === "horizontal" ? (
                  <>
                    <XAxis
                      type="number"
                      tickFormatter={valueFormatter}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={160}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="displayLabel"
                      interval={xTickAngle !== undefined ? 0 : "preserveStart"}
                      minTickGap={xTickAngle !== undefined ? 0 : 24}
                      tick={xTickStyle}
                      axisLine={false}
                      tickLine={false}
                      height={xTickAngle !== undefined ? 90 : undefined}
                      tickMargin={xTickMargin}
                    />
                    <YAxis
                      tickFormatter={valueFormatter}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={90}
                    />
                  </>
                )}
                <Tooltip cursor={{ fill: "rgba(139, 92, 246, 0.12)" }} content={renderTooltip} />
                <Bar
                  dataKey="value"
                  radius={layout === "horizontal" ? [0, 12, 12, 0] : [12, 12, 0, 0]}
                  fill={`url(#${gradientId})`}
                  maxBarSize={layout === "horizontal" ? undefined : 42}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300/60 px-4 text-sm text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
              {emptyMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
