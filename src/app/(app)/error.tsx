"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4 text-center px-6">
      <AlertTriangle className="h-10 w-10 text-amber-400" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">Page error</h2>
        <p className="text-sm text-slate-500">{error.message || "Something went wrong loading this page."}</p>
      </div>
      <Button variant="secondary" onClick={reset}>Reload</Button>
    </div>
  );
}
