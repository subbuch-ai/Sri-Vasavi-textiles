import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  maxHeightClass?: string;
  headerClassName?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-2xl",
  maxHeightClass = "max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)]",
  headerClassName = "px-4 py-3 sm:px-6 sm:py-3.5",
  bodyClassName = "p-4 sm:px-6 sm:py-4 md:[&_form]:space-y-3 md:[&_.input-field]:py-1.5",
  children,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-2 sm:p-4 overflow-hidden">
      <div
        className={`bg-white rounded-xl shadow-2xl border border-slate-200 w-full ${maxWidthClass} ${maxHeightClass} flex flex-col overflow-hidden`}
      >
        <div className={`shrink-0 flex items-start justify-between ${headerClassName} border-b border-slate-200`}>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-navy-900">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`flex-1 min-h-0 overflow-y-auto ${bodyClassName}`}>{children}</div>
      </div>
    </div>
  );
};

