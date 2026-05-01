"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastVariant = "default" | "success" | "error" | "info";

type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = (
  message: string | { title?: string; description?: string; variant?: ToastVariant }
) => void;

const ToastContext = React.createContext<{
  toast: ToastContextValue;
  success: ToastContextValue;
  error: ToastContextValue;
  info: ToastContextValue;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (variant: ToastVariant, input: Parameters<ToastContextValue>[0]) => {
      const id = crypto.randomUUID();
      const toast: Toast =
        typeof input === "string"
          ? { id, title: input, variant }
          : { id, title: input.title, description: input.description, variant: input.variant ?? variant };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = React.useMemo(
    () => ({
      toast: (i: Parameters<ToastContextValue>[0]) => push("default", i),
      success: (i: Parameters<ToastContextValue>[0]) => push("success", i),
      error: (i: Parameters<ToastContextValue>[0]) => push("error", i),
      info: (i: Parameters<ToastContextValue>[0]) => push("info", i),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
      ? AlertCircle
      : Info;
  const iconColor =
    toast.variant === "success"
      ? "text-emerald-500"
      : toast.variant === "error"
      ? "text-red-500"
      : toast.variant === "info"
      ? "text-blue-500"
      : "text-gray-400";

  return (
    <div
      className={cn(
        "pointer-events-auto min-w-[280px] max-w-[380px] rounded-xl border px-4 py-3 shadow-lg",
        "bg-white border-gray-200",
        "animate-in fade-in-0 slide-in-from-right-4 duration-200"
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", iconColor)} />
        <div className="flex-1 min-w-0">
          {toast.title && (
            <div className="text-sm font-medium text-gray-900">{toast.title}</div>
          )}
          {toast.description && (
            <div className="text-xs text-gray-500 mt-0.5">{toast.description}</div>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
