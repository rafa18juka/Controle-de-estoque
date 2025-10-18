"use client";

import { useId, useMemo } from "react";
import type { ReactNode } from "react";
import type { TooltipProps } from "recharts";
import {
  Cell,
  Label,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLORS = [
  "#7C3AED",
  "#06B6D4",
  "#22C55E",
  "#F59E0B",
  "#F97316",
  "#EC4899",
  "#0EA5E9",
  "#14B8A6",
  "#6366F1",
  "#A855F7"
];

interface DonutDatum extends Record<string, number | string> {
  name: string;
  value: number;
}

interface DonutProps {
  data: DonutDatum[];
  title: string;
  className?: string;
  formatValue?: (value: number) => string;
  headerActions?: ReactNode;
}

export function Donut({ data, title, className, formatValue, headerActions }: DonutProps) {
  const chartId = useId();
  const formatValueFn = formatValue ?? currency;

  const preparedData = useMemo(() => data.filter((item) => item.value > 0), [data]);
  const total = useMemo(
    () => preparedData.reduce((accumulator, item) => accumulator + item.value, 0),
    [preparedData]
  );

  const renderTooltip = (props: TooltipProps<number, string>) => {
    const typed = props as TooltipProps<number, string> & {
      payload?: Array<{ payload: DonutDatum }>;
    };

    if (!typed.active || !typed.payload?.length) {
      return null;
    }

    const { name, value } = typed.payload[0].payload;

    return (
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs text-slate-500">{name}</p>
        <p className="text-sm font-semibold text-slate-900">{formatValueFn(value)}</p>
      </div>
    );
  };

  const renderCenterLabel = ({ viewBox }: any) => {
    if (!viewBox || typeof viewBox.cx !== "number" || typeof viewBox.cy !== "number") {
      return null;
    }

    return (
      <text
        x={viewBox.cx}
        y={viewBox.cy}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-slate-900 text-sm font-semibold dark:fill-slate-100"
      >
        {formatValueFn(total)}
      </text>
    );
  };

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900", className)}>
      <header className="mb-4">
        <div className={cn("flex items-start justify-between gap-3", headerActions && "flex-col sm:flex-row sm:items-center sm:justify-between")}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          {headerActions ? <div className="flex-shrink-0">{headerActions}</div> : null}
        </div>
      </header>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={preparedData}
              dataKey="value"
              nameKey="name"
              innerRadius="60%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="#F8FAFC"
              strokeWidth={2}
            >
              {preparedData.map((entry, index) => (
                <Cell
                  key={`${chartId}-slice-${entry.name}-${index}`}
                  fill={COLORS[index % COLORS.length]}
                  stroke="none"
                />
              ))}
              <Label content={renderCenterLabel} position="center" />
            </Pie>
            <Tooltip content={renderTooltip} />
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              iconSize={10}
              wrapperStyle={{
                color: "#475569",
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
                paddingTop: 12
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

