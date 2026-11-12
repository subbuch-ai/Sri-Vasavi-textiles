import React from "react";

const STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  CREDIT: "bg-emerald-100 text-emerald-800",
  INBOUND: "bg-emerald-100 text-emerald-800",
  WHOLESALE: "bg-navy-100 text-navy-800",
  RETAIL: "bg-gold-100 text-gold-800",
  PARTIAL: "bg-amber-100 text-amber-800",
  PARTIALLY_RECEIVED: "bg-amber-100 text-amber-800",
  PENDING: "bg-amber-100 text-amber-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  IN_PROGRESS: "bg-indigo-100 text-indigo-800",
  READY_FOR_DELIVERY: "bg-cyan-100 text-cyan-800",
  DISPATCHED: "bg-purple-100 text-purple-800",
  DRAFT: "bg-slate-100 text-slate-700",
  UNPAID: "bg-rose-100 text-rose-800",
  REJECTED: "bg-rose-100 text-rose-800",
  CANCELLED: "bg-rose-100 text-rose-800",
  INACTIVE: "bg-slate-200 text-slate-700",
  DEBIT: "bg-rose-100 text-rose-800",
  OUTBOUND: "bg-rose-100 text-rose-800",
  LOW_STOCK: "bg-rose-100 text-rose-800",
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const key = status?.toUpperCase() || "INFO";
  const cls = STATUS_STYLES[key] || "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
};

