import React from "react";
import { Inbox } from "lucide-react";

export const EmptyState: React.FC<{ title: string; description?: string }> = ({
  title,
  description,
}) => (
  <div className="text-center py-12 px-4">
    <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
      <Inbox className="h-6 w-6" />
    </div>
    <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
    {description && <p className="text-xs text-slate-500 mt-1">{description}</p>}
  </div>
);

