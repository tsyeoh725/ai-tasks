// Human-readable labels for common enum values.
// Map raw enum values to display strings.

export const GOAL_STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  achieved: "Achieved",
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  on_hold: "On Hold",
  complete: "Complete",
};

export const PORTFOLIO_STATUS_LABELS: Record<string, string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  off_track: "Off Track",
  complete: "Complete",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  blocked: "Blocked",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  task: "Task",
  milestone: "Milestone",
  approval: "Approval",
};

export function humanize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
