"use client";

import { useId, useMemo } from "react";
import type { ReactNode } from "react";
import type { TooltipProps } from "recharts";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface LineTimeseriesDatum {
  date: string | Date;
  value: number;
  label?: string;
}

interface LineTimeseriesProps {
  data: LineTimeseriesDatum[];
  title?: string;
  className?: string;
  emptyMessage?: string;
  valueFormatter?: (value: number) => string;
  headerActions?: ReactNode;
}

export function LineTimeseries({
  data,
  title,
  className,
  emptyMessage = "Sem dados para exibir.",
  valueFormatter = currency,
  headerActions
}: LineTimeseriesProps) {
  const gradientId = useId();
  type PreparedPoint = {
    displayLabel: string;
    rawDate: Date;
    value: number;
  };

  const preparedData = useMemo<PreparedPoint[]>(() => {
    return data
      .map<PreparedPoint>((item) => {
        const dateValue = item.date instanceof Date ? item.date : new Date(item.date);
        return {
          displayLabel: item.label ?? dateValue.toLocaleDateString("pt-BR"),
          rawDate: dateValue,
          value: Number(item.value) || 0
        };
      })
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [data]);

  const renderTooltip = (props: TooltipProps<number, string> & { payload?: Array<{ payload: PreparedPoint }> }) => {
    if (!props.active || !props.payload?.length) {
      return null;
    }

    const payload = props.payload[0].payload;
    return (
      <div className="min-w-[200px] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{payload.displayLabel}</p>
        <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{valueFormatter(payload.value)}</p>
      </div>
    );
  };

  const hasData = preparedData.length > 0 && preparedData.some((item) => item.value !== 0);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-purple-500/20 dark:bg-slate-900/50",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/5 via-indigo-500/10 to-cyan-500/10 dark:from-purple-500/20 dark:via-indigo-600/10 dark:to-cyan-500/20" />
      <div className="pointer-events-none absolute -top-32 -left-28 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />

      <div className="relative z-10 space-y-6">
        {title || headerActions ? (
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

        <div className="h-72 w-full">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={preparedData} margin={{ top: 16, right: 16, left: 8, bottom: 12 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    <stop offset="55%" stopColor="#3b82f6" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.2} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#cbd5f5" strokeDasharray="4 8" vertical={false} opacity={0.25} />
                <XAxis dataKey="displayLabel" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(value: number) => valueFormatter(value)}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip content={renderTooltip} cursor={{ stroke: "#8b5cf6", strokeWidth: 1, strokeDasharray: "4 4" }} />
                <Line type="monotone" dataKey="value" stroke={`url(#${gradientId})`} strokeWidth={3} dot={false} />
              </LineChart>
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
