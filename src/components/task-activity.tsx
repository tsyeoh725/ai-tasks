"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Activity = {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

export function TaskActivity({ taskId }: { taskId: string }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/activity?entityType=task&entityId=${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        setActivities(data.activities || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [taskId]);

  function formatAction(activity: Activity) {
    const name = activity.user?.name || "Someone";

    switch (activity.action) {
      case "created":
        return `${name} created this task`;
      case "completed":
        return `${name} completed this task`;
      case "assigned":
        return `${name} changed assignee`;
      case "moved":
        return `${name} changed status from ${formatValue(activity.oldValue)} to ${formatValue(activity.newValue)}`;
      case "updated":
        if (activity.field === "priority") {
          return `${name} changed priority from ${formatValue(activity.oldValue)} to ${formatValue(activity.newValue)}`;
        }
        if (activity.field === "title") {
          return `${name} updated the title`;
        }
        if (activity.field === "description") {
          return `${name} updated the description`;
        }
        if (activity.field === "dueDate") {
          return `${name} ${activity.newValue ? "set due date" : "removed due date"}`;
        }
        return `${name} updated ${activity.field || "this task"}`;
      case "commented":
        return `${name} commented`;
      case "deleted":
        return `${name} deleted this task`;
      default:
        return `${name} ${activity.action}`;
    }
  }

  function formatValue(val: string | null) {
    if (!val) return "none";
    return val.replace(/_/g, " ");
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  const actionIcons: Record<string, string> = {
    created: "\u{2728}",
    completed: "\u{2705}",
    assigned: "\u{1F464}",
    moved: "\u{1F504}",
    updated: "\u{270F}\u{FE0F}",
    commented: "\u{1F4AC}",
    deleted: "\u{1F5D1}\u{FE0F}",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <span className="text-sm text-muted-foreground">Loading activity...</span>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No activity yet
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, i) => (
        <div key={activity.id} className="flex gap-3 py-2">
          <div className="flex flex-col items-center">
            <span className="text-sm">{actionIcons[activity.action] || "\u{1F4CB}"}</span>
            {i < activities.length - 1 && (
              <div className="w-px flex-1 bg-border mt-1" />
            )}
          </div>
          <div className="flex-1 min-w-0 pb-2">
            <p className="text-sm text-foreground">{formatAction(activity)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(activity.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
