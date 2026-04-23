type WidgetConfig = {
  id: string;
  type: "column" | "line" | "donut" | "number" | "lollipop" | "burnup";
  source: "tasks" | "projects" | "portfolios" | "goals";
  title: string;
  aggregation: "count" | "sum" | "avg";
  groupBy?: string;
  filters?: Array<{ field: string; op: string; value: unknown }>;
  width: number;
  height: number;
};

export const REPORT_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  emoji: string;
  widgets: WidgetConfig[];
}> = [
  {
    id: "team_overview",
    name: "Team Overview",
    description: "Task distribution by status, priority, and assignee",
    emoji: "\u{1F465}",
    widgets: [
      { id: "1", type: "donut", source: "tasks", title: "Tasks by Status", aggregation: "count", groupBy: "status", width: 2, height: 2 },
      { id: "2", type: "donut", source: "tasks", title: "Tasks by Priority", aggregation: "count", groupBy: "priority", width: 2, height: 2 },
      { id: "3", type: "number", source: "tasks", title: "Total Open Tasks", aggregation: "count", filters: [{ field: "status", op: "ne", value: "done" }], width: 1, height: 1 },
      { id: "4", type: "column", source: "tasks", title: "Tasks by Assignee", aggregation: "count", groupBy: "assigneeId", width: 4, height: 2 },
    ],
  },
  {
    id: "project_health",
    name: "Project Health",
    description: "Progress and velocity across all projects",
    emoji: "\u{1F4CA}",
    widgets: [
      { id: "1", type: "column", source: "projects", title: "Projects by Status", aggregation: "count", groupBy: "status", width: 2, height: 2 },
      { id: "2", type: "burnup", source: "tasks", title: "Completion Burnup (30d)", aggregation: "count", width: 4, height: 2 },
      { id: "3", type: "number", source: "projects", title: "Total Projects", aggregation: "count", width: 1, height: 1 },
    ],
  },
  {
    id: "goals_progress",
    name: "Goals Progress",
    description: "OKR health and key results",
    emoji: "\u{1F3AF}",
    widgets: [
      { id: "1", type: "donut", source: "goals", title: "Goals by Status", aggregation: "count", groupBy: "status", width: 2, height: 2 },
      { id: "2", type: "number", source: "goals", title: "Goals On Track", aggregation: "count", filters: [{ field: "status", op: "eq", value: "on_track" }], width: 1, height: 1 },
      { id: "3", type: "number", source: "goals", title: "Goals At Risk", aggregation: "count", filters: [{ field: "status", op: "eq", value: "at_risk" }], width: 1, height: 1 },
    ],
  },
  {
    id: "personal_productivity",
    name: "Personal Productivity",
    description: "Your tasks this week and completion rate",
    emoji: "\u{1F4AA}",
    widgets: [
      { id: "1", type: "number", source: "tasks", title: "Completed This Week", aggregation: "count", filters: [{ field: "status", op: "eq", value: "done" }], width: 1, height: 1 },
      { id: "2", type: "number", source: "tasks", title: "In Progress", aggregation: "count", filters: [{ field: "status", op: "eq", value: "in_progress" }], width: 1, height: 1 },
      { id: "3", type: "line", source: "tasks", title: "Completion Trend", aggregation: "count", filters: [{ field: "status", op: "eq", value: "done" }], width: 4, height: 2 },
    ],
  },
  {
    id: "overdue_snapshot",
    name: "Overdue Snapshot",
    description: "Tasks past their deadline that need attention",
    emoji: "\u{26A0}\u{FE0F}",
    widgets: [
      { id: "1", type: "column", source: "tasks", title: "Overdue by Priority", aggregation: "count", groupBy: "priority", filters: [{ field: "overdue", op: "eq", value: true }], width: 2, height: 2 },
      { id: "2", type: "column", source: "tasks", title: "Overdue by Project", aggregation: "count", groupBy: "projectId", filters: [{ field: "overdue", op: "eq", value: true }], width: 2, height: 2 },
    ],
  },
];
