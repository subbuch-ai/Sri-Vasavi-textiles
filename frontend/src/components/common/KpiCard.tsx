import React from "react";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  accent?: "navy" | "gold" | "emerald" | "rose" | "amber";
}

const accentStyles: Record<NonNullable<KpiCardProps["accent"]>, string> = {
  navy: "bg-navy-50 text-navy-700 border-navy-200",
  gold: "bg-gold-50 text-gold-600 border-gold-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
};

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "navy",
}) => {
  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 truncate">{title}</p>
          <p className="text-xl font-bold text-navy-900 mt-1.5 truncate">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2.5 rounded-lg border shrink-0 ${accentStyles[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
};

