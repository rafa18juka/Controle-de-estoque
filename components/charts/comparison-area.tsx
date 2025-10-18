"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from "recharts";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ComparisonSeriesKey = "week" | "month" | "year";

export interface ComparisonPoint {
  name: string;
  weekValue: number | null;
  weekLabel?: string | null;
  weekQuantity?: number | null;
  monthValue: number | null;
  monthLabel?: string | null;
  monthQuantity?: number | null;
  yearValue: number | null;
  yearLabel?: string | null;
  yearQuantity?: number | null;
}

interface ComparisonAreaChartProps {
  title?: string;
  className?: string;
  data: ComparisonPoint[];
  activeKeys: ComparisonSeriesKey[];
  headerActions?: ReactNode;
  valueFormatter?: (value: number) => string;
  emptyMessage?: string;
}

type SeriesMeta = {
  key: ComparisonSeriesKey;
  label: string;
  stroke: string;
  gradientId: string;
  dataKey: keyof ComparisonPoint;
  quantityKey: keyof ComparisonPoint;
};

const SERIES_META: Record<ComparisonSeriesKey, SeriesMeta> = {
  week: {
    key: "week",
    label: "Semanal",
    stroke: "#8b5cf6",
    gradientId: "waveGradientWeek",
    dataKey: "weekValue",
    quantityKey: "weekQuantity"
  },
  month: {
    key: "month",
    label: "Mensal",
    stroke: "#3b82f6",
    gradientId: "waveGradientMonth",
    dataKey: "monthValue",
    quantityKey: "monthQuantity"
  },
  year: {
    key: "year",
    label: "Anual",
    stroke: "#06b6d4",
    gradientId: "waveGradientYear",
    dataKey: "yearValue",
    quantityKey: "yearQuantity"
  }
} as const;

const DEFAULT_EMPTY_MESSAGE = "Sem dados para exibir.";

export function ComparisonAreaChart({
  title,
  className,
  data,
  activeKeys,
  headerActions,
  valueFormatter = currency,
  emptyMessage = DEFAULT_EMPTY_MESSAGE
}: ComparisonAreaChartProps) {
  const activeSeries = useMemo(
    () => activeKeys.filter((key) => SERIES_META[key]),
    [activeKeys]
  );

  const hasData = useMemo(
    () =>
      data.some((point) =>
        activeSeries.some((key) => {
          const meta = SERIES_META[key];
          const value = point[meta.dataKey] as number | null | undefined;
          return typeof value === "number" && value > 0;
        })
      ),
    [data, activeSeries]
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-purple-500/20 dark:bg-slate-900/50",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/10 to-cyan-500/10 dark:from-purple-500/20 dark:via-indigo-600/10 dark:to-cyan-500/20" />
      <div className="pointer-events-none absolute -left-40 top-[-50%] h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-[-40%] h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />

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
              <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={SERIES_META.week.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES_META.week.stroke} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={SERIES_META.week.stroke} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id={SERIES_META.month.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES_META.month.stroke} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={SERIES_META.month.stroke} stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id={SERIES_META.year.gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES_META.year.stroke} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={SERIES_META.year.stroke} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 8"
                  stroke="#cbd5f5"
                  opacity={0.25}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  tickFormatter={(value: number) => valueFormatter(value)}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip content={<ComparisonTooltip activeSeries={activeSeries} valueFormatter={valueFormatter} />} />
                {activeSeries.map((key) => {
                  const meta = SERIES_META[key];
                  return (
                    <Area
                      key={key}
                      type="monotone"
                      dataKey={meta.dataKey as string}
                      stroke={meta.stroke}
                      fill={`url(#${meta.gradientId})`}
                      strokeWidth={2}
                      fillOpacity={1}
                      connectNulls
                      animationDuration={900}
                      animationEasing="ease-out"
                    />
                  );
                })}
              </AreaChart>
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

interface ComparisonTooltipProps {
  activeSeries: ComparisonSeriesKey[];
  valueFormatter: (value: number) => string;
}

const seriesLabelKeyMap: Record<ComparisonSeriesKey, keyof ComparisonPoint> = {
  week: "weekLabel",
  month: "monthLabel",
  year: "yearLabel"
};

const seriesQuantityKeyMap: Record<ComparisonSeriesKey, keyof ComparisonPoint> = {
  week: "weekQuantity",
  month: "monthQuantity",
  year: "yearQuantity"
};

type AreaTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: ComparisonPoint }>;
  label?: string;
};

function ComparisonTooltip(
  props: AreaTooltipProps & ComparisonTooltipProps
) {
  const { activeSeries, valueFormatter, payload, active, label } = props;
  const point =
    payload && payload.length ? (payload[0].payload as ComparisonPoint) : undefined;

  if (!active || !point) {
    return null;
  }

  const entries = activeSeries
    .map((key) => {
      const meta = SERIES_META[key];
      const value = point[meta.dataKey] as number | null | undefined;
      if (typeof value !== "number") {
        return null;
      }
      const seriesLabel = point[seriesLabelKeyMap[key]] as string | null | undefined;
      const quantity = point[seriesQuantityKeyMap[key]] as number | null | undefined;
      return {
        key,
        meta,
        value,
        label: seriesLabel,
        quantity
      };
    })
    .filter(Boolean) as Array<{
    key: ComparisonSeriesKey;
    meta: SeriesMeta;
    value: number;
    label?: string | null;
    quantity?: number | null;
  }>;

  if (!entries.length) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {typeof label === "string" ? label : point.name}
      </p>
      <div className="mt-3 space-y-2">
        {entries.map(({ key, meta, value, label, quantity }) => (
          <div key={key} className="rounded-lg border border-slate-200/70 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-800/70">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-300">{meta.label}</p>
            {label ? <p className="text-xs text-slate-400 dark:text-slate-400">{label}</p> : null}
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {valueFormatter(value)}
            </p>
            {typeof quantity === "number" ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {quantity.toLocaleString("pt-BR")} itens
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
