interface StatsCardProps {
  label: string;
  value: string;
  description?: string;
  accent?: "default" | "success" | "danger";
}

const accentClasses: Record<NonNullable<StatsCardProps["accent"]>, string> = {
  default: "border-slate-200",
  success: "border-emerald-300",
  danger: "border-rose-300"
};

export function StatsCard({ label, value, description, accent = "default" }: StatsCardProps) {
  return (
    <div className={`card border-2 ${accentClasses[accent]} flex flex-col gap-1`}> 
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      {description ? <span className="text-sm text-slate-500">{description}</span> : null}
    </div>
  );
}
