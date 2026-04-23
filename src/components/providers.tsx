"use client";

import { SessionProvider } from "next-auth/react";
import { CommandPaletteProvider } from "@/components/command-palette";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CommandPaletteProvider>{children}</CommandPaletteProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
