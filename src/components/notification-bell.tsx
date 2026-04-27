"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { PushToggle } from "@/components/push-toggle";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetchNotifications();
    // Poll every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?limit=20");
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {}
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleClick(notif: Notification) {
    // Mark as read
    if (!notif.read) {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notif.id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    // Navigate to entity
    if (notif.entityType === "task" && notif.entityId) {
      router.push(`/tasks/${notif.entityId}`);
      setOpen(false);
    }
  }

  const typeIcons: Record<string, string> = {
    assigned: "\u{1F464}",
    mentioned: "\u{0040}",
    commented: "\u{1F4AC}",
    status_changed: "\u{1F504}",
    due_soon: "\u{23F0}",
    completed: "\u{2705}",
  };

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  // Group by Today / Yesterday / Earlier
  function groupNotifications(items: Notification[]) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86_400_000;
    const groups: { label: string; items: Notification[] }[] = [
      { label: "Today", items: [] },
      { label: "Yesterday", items: [] },
      { label: "Earlier", items: [] },
    ];
    for (const n of items) {
      const t = new Date(n.createdAt).getTime();
      if (t >= todayStart) groups[0].items.push(n);
      else if (t >= yesterdayStart) groups[1].items.push(n);
      else groups[2].items.push(n);
    }
    return groups.filter((g) => g.items.length > 0);
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative h-11 w-11 md:h-9 md:w-9 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-[60vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
                type="button"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1 max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                <div className="h-10 w-10 rounded-full bg-[#99ff33]/15 flex items-center justify-center mb-2">
                  <svg className="h-5 w-5 text-[#2d5200]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">You're all caught up</p>
                <p className="text-xs text-gray-400 mt-0.5">No new notifications</p>
              </div>
            ) : (
              groupNotifications(notifications).map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold px-4 pt-2 pb-1 bg-gray-50/60">
                    {group.label}
                  </p>
                  {group.items.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={cn(
                        "w-full text-left px-4 py-3 border-b last:border-0 hover:bg-accent/50 transition-colors flex gap-3",
                        !notif.read && "bg-[#99ff33]/5"
                      )}
                      type="button"
                    >
                      <span className="text-base mt-0.5 flex-shrink-0">
                        {typeIcons[notif.type] || "\u{1F514}"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", !notif.read && "font-medium")}>
                          {notif.title}
                        </p>
                        {notif.message && (
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{notif.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-0.5">
                          {timeAgo(notif.createdAt)}
                        </p>
                      </div>
                      {!notif.read && (
                        <span className="h-2 w-2 rounded-full bg-[#99ff33] flex-shrink-0 mt-2 ring-2 ring-[#99ff33]/20" />
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="border-t px-4 py-2.5 flex items-center justify-between gap-2">
            <button
              onClick={() => {
                router.push("/inbox");
                setOpen(false);
              }}
              className="text-xs text-primary hover:underline"
              type="button"
            >
              Manage inbox
            </button>
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  );
}
