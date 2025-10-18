"use client";

import { useId, useMemo } from "react";
import type { TooltipProps } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { currency, formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";

interface BarTimeseriesDatum {
  date: string | Date;
  value: number;
  label?: string;
  quantity?: number;
}

interface BarTimeseriesProps {
  data: BarTimeseriesDatum[];
  title?: string;
  className?: string;
}

export function BarTimeseries({ data, title, className }: BarTimeseriesProps) {
  const gradientId = useId();

  const preparedData = useMemo(() => {
    return data.map((item) => {
      const dateValue = item.date instanceof Date ? item.date : new Date(item.date);
      return {
        ...item,
        rawDate: dateValue,
        displayLabel: item.label ?? formatDay(dateValue)
      };
    });
  }, [data]);

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const typed = props as TooltipProps<number, string> & {
      payload?: Array<{ payload: { rawDate: Date; value: number; quantity?: number } }>;
    };

    if (!typed.active || !typed.payload?.length) {
      return null;
    }

    const { rawDate, value, quantity } = typed.payload[0].payload;

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs text-slate-500">{formatDay(rawDate)}</p>
        <p className="text-sm font-semibold text-slate-900">{currency(value)}</p>
        {typeof quantity === "number" ? (
          <p className="text-xs text-slate-500">{quantity.toLocaleString("pt-BR")} itens</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
      {title ? (
        <header className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        </header>
      ) : null}
      <div className="mt-4 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={preparedData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#06B6D4" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="displayLabel"
              interval="preserveStartEnd"
              minTickGap={24}
              tick={{ fill: "#475569", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => currency(value)}
              tick={{ fill: "#475569", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip cursor={{ fill: "rgba(124, 58, 237, 0.08)" }} content={renderTooltip} />
            <Bar dataKey="value" radius={[12, 12, 0, 0]} fill={`url(#${gradientId})`} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
