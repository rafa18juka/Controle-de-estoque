"use client";

import { useMemo } from "react";
import type { TooltipProps } from "recharts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UserComparisonDatum {
  user: string;
  quantity: number;
  totalValue?: number;
  secondaryLabel?: string;
  secondaryValue?: number;
}

interface UserComparisonChartProps {
  data: UserComparisonDatum[];
  title?: string;
  className?: string;
  quantityLabel?: string;
}

const COLORS = ["#7C3AED", "#06B6D4", "#F97316", "#0EA5E9", "#F973AB", "#FACC15"];

export function UserComparisonChart({ data, title, className, quantityLabel }: UserComparisonChartProps) {
  const chartData = useMemo(() => {
    return data.map((item, index) => ({
      ...item,
      fill: COLORS[index % COLORS.length]
    }));
  }, [data]);

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const typed = props as TooltipProps<number, string> & {
      payload?: Array<{ payload: UserComparisonDatum & { fill: string } }>;
    };

    if (!typed.active || !typed.payload?.length) {
      return null;
    }

    const payload = typed.payload[0].payload;
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{payload.user}</p>
        <p className="text-sm font-semibold text-slate-900">
          {payload.quantity.toLocaleString("pt-BR")} {quantityLabel ?? "itens"}
        </p>
        {typeof payload.secondaryValue === "number" && payload.secondaryLabel ? (
          <p className="text-xs text-slate-500">
            {payload.secondaryValue.toLocaleString("pt-BR")} {payload.secondaryLabel}
          </p>
        ) : null}
        {typeof payload.totalValue === "number" ? (
          <p className="text-xs text-slate-500">{currency(payload.totalValue)}</p>
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
          <BarChart data={chartData}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" vertical={false} />
            <XAxis
              dataKey="user"
              tick={{ fill: "#475569", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value: number) => value.toLocaleString("pt-BR")}
              tick={{ fill: "#475569", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip cursor={{ fill: "rgba(124, 58, 237, 0.08)" }} content={renderTooltip} />
            <Bar dataKey="quantity" radius={[12, 12, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${entry.user}-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

