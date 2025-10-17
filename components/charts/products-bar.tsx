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
  const baseTickStyle = { fill: "#475569", fontSize: 12 };
  const xTickStyle =
    layout === "horizontal"
      ? baseTickStyle
      : xTickAngle !== undefined
        ? { ...baseTickStyle, angle: xTickAngle, textAnchor: "end" as const }
        : baseTickStyle;
  const xTickMargin = layout === "horizontal" ? 8 : xTickAngle !== undefined ? 20 : 8;

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const typed = props as TooltipProps<number, string> & {
      payload?: Array<{ payload: ProductsBarDatum & { value: number } }>;
    };

    if (!typed.active || !typed.payload?.length) {
      return null;
    }

    const { name, value, helper } = typed.payload[0].payload;

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
        <p className="text-xs text-slate-500">{name}</p>
        <p className="text-sm font-semibold text-slate-900">{valueFormatter(value)}</p>
        {helper ? <p className="text-xs text-slate-500">{helper}</p> : null}
      </div>
    );
  };

  return (
    <div className={cn("rounded-2xl bg-white p-6 shadow-sm", className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {headerActions}
      </header>
      <div className={cn(heightClass, "w-full")}>
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={prepared}
              layout={layout === "horizontal" ? "vertical" : "horizontal"}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" horizontal={layout !== "horizontal"} vertical={false} />
              {layout === "horizontal" ? (
                <>
                  <XAxis
                    type="number"
                    tickFormatter={valueFormatter}
                    tick={{ fill: "#475569", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fill: "#475569", fontSize: 12 }}
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
                    tick={baseTickStyle}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                </>
              )}
              <Tooltip cursor={{ fill: "rgba(14, 165, 233, 0.12)" }} content={renderTooltip} />
              <Bar dataKey="value" radius={layout === "horizontal" ? [0, 6, 6, 0] : [6, 6, 0, 0]} fill={`url(#${gradientId})`} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-sm text-slate-500">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
