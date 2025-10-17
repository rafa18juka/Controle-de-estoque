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

  const preparedData = useMemo(() => {
    return data
      .map((item) => {
        const dateValue = item.date instanceof Date ? item.date : new Date(item.date);
        return {
          ...item,
          displayLabel: item.label ?? dateValue.toLocaleDateString("pt-BR"),
          rawDate: dateValue,
          value: Number(item.value) || 0
        };
      })
      .sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  }, [data]);

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const typed = props as TooltipProps<number, string> & {
      payload?: Array<{ payload: (typeof preparedData)[number] }>;
    };
    if (!typed.active || !typed.payload?.length) {
      return null;
    }

    const payload = typed.payload[0].payload;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
        <p className="text-xs text-slate-500">{payload.displayLabel}</p>
        <p className="text-sm font-semibold text-slate-900">{valueFormatter(payload.value)}</p>
      </div>
    );
  };

  const hasData = preparedData.length > 0 && preparedData.some((item) => item.value !== 0);

  return (
    <div className={cn("rounded-2xl bg-white p-6 shadow-sm", className)}>
      {title ? (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          {headerActions}
        </header>
      ) : null}
      <div className="h-72 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={preparedData} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="#6366F1" stopOpacity={0.3} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="displayLabel" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={(value: number) => valueFormatter(value)}
                tick={{ fill: "#475569", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip content={renderTooltip} cursor={{ stroke: "#0EA5E9", strokeWidth: 1 }} />
              <Line type="monotone" dataKey="value" stroke={`url(#${gradientId})`} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-sm text-slate-500">{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
