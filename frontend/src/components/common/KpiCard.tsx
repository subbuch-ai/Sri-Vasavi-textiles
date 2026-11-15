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
    <div className="card p-3.5 sm:p-4 hover:shadow-md transition-all duration-200 border border-slate-200/80 bg-white flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 leading-tight">
            {title}
          </p>
          <p className="text-lg sm:text-xl font-black text-navy-900 mt-1 tracking-tight tabular-nums break-words">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium leading-tight">{subtitle}</p>
          )}
        </div>
        <div className={`p-2 sm:p-2.5 rounded-xl border shrink-0 ${accentStyles[accent]}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  );
};

