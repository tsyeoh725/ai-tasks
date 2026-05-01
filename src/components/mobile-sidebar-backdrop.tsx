"use client";

import { useSidebar } from "@/components/sidebar-context";

export function MobileSidebarBackdrop() {
  const { open, setOpen } = useSidebar();
  if (!open) return null;
  return (
    <div
      aria-hidden
      onClick={() => setOpen(false)}
      className="md:hidden fixed inset-0 top-12 z-30 bg-black/50 backdrop-blur-sm"
    />
  );
}
