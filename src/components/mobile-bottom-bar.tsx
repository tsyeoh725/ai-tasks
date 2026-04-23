"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CheckSquare, Calendar, Sparkles, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/sidebar-context";

type NavItem = {
  label: string;
  href?: string;
  icon: typeof Home;
  matchPrefixes?: string[];
};

const ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Tasks", href: "/tasks", icon: CheckSquare, matchPrefixes: ["/tasks"] },
  { label: "Schedule", href: "/schedule", icon: Calendar, matchPrefixes: ["/schedule"] },
  { label: "Ask AI", href: "/ai", icon: Sparkles, matchPrefixes: ["/ai"] },
];

export function MobileBottomBar() {
  const pathname = usePathname();
  const { toggle } = useSidebar();

  function isActive(item: NavItem) {
    if (!item.href) return false;
    if (item.href === "/") return pathname === "/";
    if (item.matchPrefixes) return item.matchPrefixes.some((p) => pathname.startsWith(p));
    return pathname === item.href;
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[rgb(15_15_25/0.92)] backdrop-blur-xl pb-[env(safe-area-inset-bottom,0)]"
      aria-label="Primary navigation"
    >
      <div className="flex items-stretch justify-around">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.label}
              href={item.href!}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors",
                active ? "text-white" : "text-white/55 hover:text-white/80",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-5 w-5", active && "text-indigo-300")} />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={toggle}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-white/55 hover:text-white/80 transition-colors"
          aria-label="Open more menu"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}
