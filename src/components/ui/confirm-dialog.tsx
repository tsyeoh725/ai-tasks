"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
};

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<
    | (ConfirmOptions & {
        resolve: (value: boolean) => void;
      })
    | null
  >(null);

  const confirm = React.useCallback<ConfirmContextValue>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  const handleCancel = React.useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  const handleConfirm = React.useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const open = state !== null;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleCancel();
        }}
      >
        {state && (
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{state.title}</DialogTitle>
              {state.description && (
                <DialogDescription>{state.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                {state.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={state.variant === "destructive" ? "destructive" : "primary"}
                onClick={handleConfirm}
                autoFocus
              >
                {state.confirmLabel ?? "Confirm"}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return ctx;
}
