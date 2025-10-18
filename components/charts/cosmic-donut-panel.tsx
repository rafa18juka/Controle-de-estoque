"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TooltipProps } from "recharts";
import { useMemo } from "react";

import { currency } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CosmicDonutDatum {
  name: string;
  value: number;
  color?: string;
  helper?: string;
}

interface SupplementaryDonutConfig {
  id: string;
  title: string;
  subtitle?: string;
  data: CosmicDonutDatum[];
  valueFormatter?: (value: number) => string;
  totalFormatter?: (total: number) => string;
  emptyMessage?: string;
}

interface CosmicDonutPanelProps {
  title: string;
  subtitle?: string;
  data: CosmicDonutDatum[];
  className?: string;
  valueFormatter?: (value: number) => string;
  totalFormatter?: (total: number) => string;
  selectable?: boolean;
  selectedKeys?: string[];
  onSelectItem?: (name: string) => void;
  maxVisibleItems?: number;
  showList?: boolean;
  supplementaryDonuts?: SupplementaryDonutConfig[];
}

type DonutTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ payload: CosmicDonutDatum }>;
  label?: string;
};

const DEFAULT_EMPTY = "Sem dados para exibir.";

export function CosmicDonutPanel({
  title,
  subtitle,
  data,
  className,
  valueFormatter = currency,
  totalFormatter = currency,
  selectable = false,
  selectedKeys,
  onSelectItem,
  maxVisibleItems = 0,
  showList = true,
  supplementaryDonuts = []
}: CosmicDonutPanelProps) {
  const total = useMemo(() => data.reduce((accumulator, item) => accumulator + Number(item.value || 0), 0), [data]);
  const pieData = useMemo(() => data.map((item) => ({ ...item })), [data]);
  const items = useMemo(() => (maxVisibleItems > 0 ? pieData.slice(0, maxVisibleItems) : pieData), [pieData, maxVisibleItems]);
  const supplementarySections = useMemo(
    () =>
      supplementaryDonuts.map((section, index) => ({
        id: section.id || `supplementary-${index}`,
        title: section.title,
        subtitle: section.subtitle,
        data: section.data ?? [],
        valueFormatter: section.valueFormatter ?? valueFormatter,
        totalFormatter: section.totalFormatter ?? totalFormatter,
        emptyMessage: section.emptyMessage ?? DEFAULT_EMPTY
      })),
    [supplementaryDonuts, valueFormatter, totalFormatter]
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[32px] border border-slate-200/70 bg-white/95 p-6 shadow-sm transition dark:border-purple-500/30 dark:bg-slate-900/60",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-500/15 via-indigo-500/10 to-cyan-500/15 dark:from-purple-500/30 dark:via-indigo-600/20 dark:to-cyan-500/25" />
      <div className="pointer-events-none absolute -top-28 -left-32 h-72 w-72 rounded-full bg-purple-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-cyan-500/25 blur-3xl" />

      <div className="relative z-10 grid gap-6 xl:grid-cols-[minmax(260px,360px)_1fr]">
        <div className="flex flex-col gap-5 rounded-[28px] border border-white/10 bg-white/40 p-5 shadow-inner backdrop-blur dark:bg-slate-900/60">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200">{title}</h3>
            {subtitle ? (
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-300">{subtitle}</p>
            ) : null}
          </div>

          <div className="grid gap-4">
            <div className="relative flex h-[260px] items-center justify-center">
              <DonutContent
                data={pieData}
                valueFormatter={valueFormatter}
                totalFormatter={totalFormatter}
                emptyMessage={DEFAULT_EMPTY}
                innerRadius="60%"
                outerRadius="85%"
                centerSize={120}
              />
            </div>

            {supplementarySections.map((section) => (
              <div
                key={section.id}
                className="rounded-[24px] border border-white/10 bg-white/30 p-4 shadow-inner backdrop-blur dark:bg-slate-900/50"
              >
                <div>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200">
                    {section.title}
                  </h4>
                  {section.subtitle ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-300">{section.subtitle}</p>
                  ) : null}
                </div>
                <div className="relative mt-4 flex h-[220px] items-center justify-center">
                  <DonutContent
                    data={section.data}
                    valueFormatter={section.valueFormatter}
                    totalFormatter={section.totalFormatter}
                    emptyMessage={section.emptyMessage}
                    innerRadius="58%"
                    outerRadius="82%"
                    centerSize={110}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {showList ? (
          <div className="flex flex-col justify-between rounded-[28px] border border-white/10 bg-white/30 p-5 shadow-inner backdrop-blur dark:bg-slate-900/40">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200">Destaques</h4>
            <div className="mt-4 space-y-3">
              {items.map((item, index) => {
                const percent = total > 0 ? (item.value / total) * 100 : 0;
                const color = item.color ?? defaultPalette[index % defaultPalette.length];
                const isActive = selectable && selectedKeys?.includes(item.name);
                const handleClick = () => {
                  if (!selectable || typeof onSelectItem !== "function") {
                    return;
                  }
                  onSelectItem(item.name);
                };
                const content = (
                  <div
                    className={cn(
                      "rounded-2xl border border-white/5 bg-white/20 p-3 shadow-sm backdrop-blur transition dark:bg-slate-900/50",
                      isActive
                        ? "ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-slate-900"
                        : "hover:bg-white/30 dark:hover:bg-slate-900/60"
                    )}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                      <span>{item.name}</span>
                      <span>{valueFormatter(item.value)}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/40 dark:bg-slate-700/60">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, percent)}%`,
                          background: color
                        }}
                      />
                    </div>
                    {item.helper ? (
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{item.helper}</p>
                    ) : null}
                  </div>
                );

                return selectable ? (
                  <button
                    key={`${item.name}-${index}`}
                    type="button"
                    onClick={handleClick}
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                  >
                    {content}
                  </button>
                ) : (
                  <div key={`${item.name}-${index}`}>{content}</div>
                );
              })}
              {!items.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300/60 p-4 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-300">
                  {DEFAULT_EMPTY}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const defaultPalette = [
  "#22d3ee",
  "#a855f7",
  "#38bdf8",
  "#6366f1",
  "#f59e0b",
  "#f97316",
  "#ec4899",
  "#10b981"
];

interface DonutContentProps {
  data: CosmicDonutDatum[];
  valueFormatter: (value: number) => string;
  totalFormatter: (total: number) => string;
  emptyMessage: string;
  innerRadius: number | string;
  outerRadius: number | string;
  centerSize: number;
}

function DonutContent({
  data,
  valueFormatter,
  totalFormatter,
  emptyMessage,
  innerRadius,
  outerRadius,
  centerSize
}: DonutContentProps) {
  const total = useMemo(
    () => data.reduce((accumulator, item) => accumulator + Number(item.value || 0), 0),
    [data]
  );

  if (total <= 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-slate-300/60 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-300">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data as unknown as Array<Record<string, unknown>>}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={4}
            stroke="rgba(15,23,42,0.2)"
            strokeWidth={2}
          >
            {data.map((item, index) => (
              <Cell
                key={`${item.name}-${index}`}
                fill={item.color ?? defaultPalette[index % defaultPalette.length]}
              />
            ))}
          </Pie>
          <Tooltip
            content={<CosmicDonutTooltip valueFormatter={valueFormatter} />}
            wrapperStyle={{ zIndex: 40 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div
          className="flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-slate-900/80 to-slate-900/40 text-center shadow-lg shadow-cyan-500/20 backdrop-blur"
          style={{ width: centerSize, height: centerSize }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Total</span>
          <span className="text-lg font-bold text-white">{totalFormatter(total)}</span>
        </div>
      </div>
    </>
  );
}

function CosmicDonutTooltip({
  active,
  payload,
  label,
  valueFormatter
}: DonutTooltipProps & { valueFormatter: (value: number) => string }) {
  if (!active || !payload?.length) {
    return null;
  }

  const datum = payload[0].payload as CosmicDonutDatum;
  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-200 bg-white/95 p-4 text-sm shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {datum.name ?? label}
      </span>
      <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{valueFormatter(datum.value)}</p>
      {datum.helper ? <p className="text-xs text-slate-500 dark:text-slate-400">{datum.helper}</p> : null}
    </div>
  );
}
