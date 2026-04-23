"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  archivedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};

type Tab = "all" | "activity" | "messages" | "archived";
type FilterKind = "all" | "activity" | "messages";

const typeIcons: Record<string, string> = {
  assigned: "\u{1F464}",
  mentioned: "\u{0040}",
  commented: "\u{1F4AC}",
  status_changed: "\u{1F504}",
  due_soon: "\u{23F0}",
  completed: "\u{2705}",
  message: "\u{2709}\u{FE0F}",
  status_update: "\u{1F4CA}",
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

export default function InboxPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [filter, setFilter] = useState<FilterKind>("all");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?tab=${activeTab}&limit=100`);
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  async function archiveNotification(id: string) {
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function snoozeNotification(id: string, hours: number | "tomorrow") {
    let snoozeUntil: Date;
    if (hours === "tomorrow") {
      snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + 1);
      snoozeUntil.setHours(9, 0, 0, 0);
    } else {
      snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
    }
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snoozedUntil: snoozeUntil.toISOString() }),
    });
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function openInContext(notif: Notification) {
    if (!notif.entityType || !notif.entityId) return;
    if (!notif.read) {
      fetch(`/api/notifications/${notif.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
    if (notif.entityType === "task") {
      router.push(`/tasks/${notif.entityId}`);
    } else if (notif.entityType === "project") {
      router.push(`/projects/${notif.entityId}`);
    } else if (notif.entityType === "team") {
      router.push(`/teams/${notif.entityId}`);
    }
  }

  const filtered = notifications.filter((n) => {
    if (activeTab === "archived") return true;
    if (filter === "activity") return n.type !== "message";
    if (filter === "messages") return n.type === "message";
    return true;
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "activity", label: "Activity" },
    { id: "messages", label: "Messages" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">Inbox</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => v && setFilter(v as FilterKind)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="activity">Activity</SelectItem>
              <SelectItem value="messages">Messages</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchNotifications}>
            <svg
              className="h-4 w-4 mr-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </Button>
        </div>
      </div>

      <div className="px-4 pt-3 border-b">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                activeTab === t.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <p className="text-muted-foreground text-sm">
              You&apos;re all caught up <span aria-hidden>{"\u{1F389}"}</span>
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3 hover:bg-accent/40 transition-colors",
                  !notif.read && activeTab !== "archived" && "bg-primary/5",
                )}
              >
                <span
                  className="text-base mt-0.5 flex-shrink-0"
                  aria-hidden
                >
                  {typeIcons[notif.type] || "\u{1F514}"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-sm",
                        !notif.read && activeTab !== "archived" && "font-medium",
                      )}
                    >
                      {notif.title}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  {notif.message && (
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {notif.message}
                    </p>
                  )}
                  {notif.entityType && notif.entityId && (
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                      {notif.entityType}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {activeTab !== "archived" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => archiveNotification(notif.id)}
                        title="Archive"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                          />
                        </svg>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="sm" title="Snooze" />
                          }
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => snoozeNotification(notif.id, 1)}
                          >
                            1 hour
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => snoozeNotification(notif.id, 4)}
                          >
                            4 hours
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              snoozeNotification(notif.id, "tomorrow")
                            }
                          >
                            Tomorrow
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                  {notif.entityId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openInContext(notif)}
                      title="Open in context"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
