"use client";

import { useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  differenceInDays,
  endOfMonth,
  format,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  isSameMonth,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate?: string | null;
  dueDate: string | null;
  assignee?: { name: string } | null;
  isMilestone?: boolean;
};

type Dependency = {
  dependentTaskId: string;
  dependencyTaskId: string;
};

type Props = {
  tasks: Task[];
  onTaskClick: (taskId: string) => void;
  dependencies?: Dependency[];
};

type ZoomLevel = "day" | "week" | "month";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  done: "bg-green-500",
  blocked: "bg-red-500",
};

const STATUS_BORDER_COLORS: Record<string, string> = {
  todo: "border-slate-500",
  in_progress: "border-blue-600",
  done: "border-green-600",
  blocked: "border-red-600",
};

const TASK_NAME_WIDTH = 200;
const DAY_COLUMN_WIDTH = 40;
const WEEK_COLUMN_WIDTH = 20;
const MONTH_COLUMN_WIDTH = 28;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 48;

function resolveTaskDates(task: Task, today: Date) {
  let start: Date;
  let end: Date;

  if (task.startDate && task.dueDate) {
    start = parseISO(task.startDate);
    end = parseISO(task.dueDate);
  } else if (task.startDate && !task.dueDate) {
    start = parseISO(task.startDate);
    end = addDays(start, 3);
  } else if (!task.startDate && task.dueDate) {
    end = parseISO(task.dueDate);
    start = addDays(end, -3);
  } else {
    start = today;
    end = addDays(today, 3);
  }

  return { start: startOfDay(start), end: startOfDay(end) };
}

export function TimelineView({ tasks, onTaskClick, dependencies = [] }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const [monthOffset, setMonthOffset] = useState(0);

  const today = useMemo(() => startOfDay(new Date()), []);
  const colWidth = zoom === "day" ? DAY_COLUMN_WIDTH : zoom === "week" ? WEEK_COLUMN_WIDTH : MONTH_COLUMN_WIDTH;

  const taskDates = useMemo(() => {
    return tasks.map((t) => ({
      task: t,
      ...resolveTaskDates(t, today),
    }));
  }, [tasks, today]);

  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    if (zoom === "month") {
      const targetMonth = addMonths(today, monthOffset);
      const s = startOfMonth(targetMonth);
      const e = endOfMonth(targetMonth);
      return {
        timelineStart: s,
        timelineEnd: e,
        totalDays: differenceInDays(e, s) + 1,
      };
    }

    if (taskDates.length === 0) {
      const s = addDays(today, -7);
      const e = addDays(today, 30);
      return {
        timelineStart: s,
        timelineEnd: e,
        totalDays: differenceInDays(e, s) + 1,
      };
    }

    let earliest = taskDates[0].start;
    let latest = taskDates[0].end;

    for (const td of taskDates) {
      if (td.start < earliest) earliest = td.start;
      if (td.end > latest) latest = td.end;
    }

    const s = addDays(earliest, -3);
    const e = addDays(latest, 3);

    return {
      timelineStart: s,
      timelineEnd: e,
      totalDays: differenceInDays(e, s) + 1,
    };
  }, [taskDates, today, zoom, monthOffset]);

  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => addDays(timelineStart, i));
  }, [timelineStart, totalDays]);

  const monthHeaders = useMemo(() => {
    const months: { label: string; startCol: number; span: number }[] = [];
    let currentMonth: Date | null = null;
    let startCol = 0;

    for (let i = 0; i < days.length; i++) {
      const monthStart = startOfMonth(days[i]);
      if (!currentMonth || !isSameMonth(currentMonth, monthStart)) {
        if (currentMonth !== null) {
          months[months.length - 1].span = i - startCol;
        }
        currentMonth = monthStart;
        startCol = i;
        months.push({
          label: format(days[i], "MMM yyyy"),
          startCol: i,
          span: 0,
        });
      }
    }
    if (months.length > 0) {
      months[months.length - 1].span = days.length - startCol;
    }

    return months;
  }, [days]);

  const todayOffset = useMemo(() => {
    const diff = differenceInDays(today, timelineStart);
    if (diff < 0 || diff >= totalDays) return null;
    return diff;
  }, [today, timelineStart, totalDays]);

  function getBarStyle(start: Date, end: Date) {
    const startOffset = differenceInDays(start, timelineStart);
    const duration = Math.max(differenceInDays(end, start), 1);
    return {
      left: startOffset * colWidth,
      width: duration * colWidth,
    };
  }

  function scrollBy(direction: number) {
    if (scrollRef.current) {
      const step = colWidth * 7;
      scrollRef.current.scrollLeft += direction * step;
    }
  }

  function scrollToToday() {
    if (scrollRef.current && todayOffset !== null) {
      const containerWidth = scrollRef.current.clientWidth;
      scrollRef.current.scrollLeft =
        todayOffset * colWidth - containerWidth / 2;
    }
  }

  // Build a map of task id -> row index for dependency arrows
  const taskRowMap = useMemo(() => {
    const map = new Map<string, number>();
    tasks.forEach((t, i) => map.set(t.id, i));
    return map;
  }, [tasks]);

  const timelineWidth = totalDays * colWidth;

  return (
    <div className="flex flex-col border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-3 py-2 bg-muted/30">
        <span className="text-sm font-medium text-muted-foreground mr-auto">
          Timeline
        </span>
        <Button variant="outline" size="xs" onClick={() => scrollBy(-1)}>
          &larr;
        </Button>
        <Button variant="outline" size="xs" onClick={scrollToToday}>
          Today
        </Button>
        <Button variant="outline" size="xs" onClick={() => scrollBy(1)}>
          &rarr;
        </Button>
        <div className="flex items-center gap-1 ml-2 border rounded-md overflow-hidden">
          <button
            onClick={() => setZoom("day")}
            className={cn(
              "px-2 py-0.5 text-xs transition-colors",
              zoom === "day"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Day
          </button>
          <button
            onClick={() => setZoom("week")}
            className={cn(
              "px-2 py-0.5 text-xs transition-colors",
              zoom === "week"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Week
          </button>
          <button
            onClick={() => { setZoom("month"); setMonthOffset(0); }}
            className={cn(
              "px-2 py-0.5 text-xs transition-colors",
              zoom === "month"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            Month
          </button>
        </div>
        {zoom === "month" && (
          <div className="flex items-center gap-1 ml-2">
            <Button variant="outline" size="xs" onClick={() => setMonthOffset((o) => o - 1)}>
              &larr;
            </Button>
            <span className="text-xs font-medium text-muted-foreground min-w-[80px] text-center">
              {format(addMonths(today, monthOffset), "MMM yyyy")}
            </span>
            <Button variant="outline" size="xs" onClick={() => setMonthOffset((o) => o + 1)}>
              &rarr;
            </Button>
          </div>
        )}
      </div>

      <div className="flex overflow-hidden">
        {/* Left column: task names */}
        <div
          className="shrink-0 border-r bg-muted/20"
          style={{ width: TASK_NAME_WIDTH }}
        >
          {/* Header spacer */}
          <div
            className="border-b px-3 flex items-end text-xs font-medium text-muted-foreground"
            style={{ height: HEADER_HEIGHT }}
          >
            Task
          </div>
          {/* Task names */}
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 border-b px-3 cursor-pointer hover:bg-muted/50 transition-colors"
              style={{ height: ROW_HEIGHT }}
              onClick={() => onTaskClick(task.id)}
            >
              <span
                className={cn(
                  "size-2 rounded-full shrink-0",
                  STATUS_COLORS[task.status] ?? "bg-gray-400"
                )}
              />
              <span className="text-sm truncate" title={task.title}>
                {task.title}
              </span>
            </div>
          ))}
        </div>

        {/* Right: scrollable timeline */}
        <div ref={scrollRef} className="overflow-x-auto flex-1">
          <div style={{ width: timelineWidth, position: "relative" }}>
            {/* Date headers */}
            <div className="flex border-b" style={{ height: HEADER_HEIGHT }}>
              <div className="relative w-full">
                {/* Month row */}
                <div className="flex h-1/2">
                  {monthHeaders.map((m) => (
                    <div
                      key={m.label + m.startCol}
                      className="text-xs font-medium text-muted-foreground border-r flex items-center px-1 truncate"
                      style={{
                        width: m.span * colWidth,
                        minWidth: m.span * colWidth,
                      }}
                    >
                      {m.span * colWidth > 50 ? m.label : ""}
                    </div>
                  ))}
                </div>
                {/* Day row */}
                <div className="flex h-1/2">
                  {days.map((day, i) => (
                    <div
                      key={i}
                      className={cn(
                        "text-[10px] text-center border-r flex items-center justify-center shrink-0",
                        isToday(day) && "bg-red-50 dark:bg-red-950/30 font-bold",
                        day.getDay() === 0 || day.getDay() === 6
                          ? "text-muted-foreground/50"
                          : "text-muted-foreground"
                      )}
                      style={{ width: colWidth }}
                    >
                      {zoom === "month"
                        ? format(day, "d")
                        : colWidth >= 30
                          ? format(day, "d")
                          : ""}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Task rows */}
            {taskDates.map(({ task, start, end }, rowIndex) => {
              const bar = getBarStyle(start, end);
              const statusColor = STATUS_COLORS[task.status] ?? "bg-gray-400";
              const borderColor =
                STATUS_BORDER_COLORS[task.status] ?? "border-gray-500";

              return (
                <div
                  key={task.id}
                  className="relative border-b"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Background grid lines */}
                  <div className="absolute inset-0 flex">
                    {days.map((day, i) => (
                      <div
                        key={i}
                        className={cn(
                          "shrink-0 border-r border-border/30",
                          (day.getDay() === 0 || day.getDay() === 6) &&
                            "bg-muted/20"
                        )}
                        style={{ width: colWidth }}
                      />
                    ))}
                  </div>

                  {/* Task bar or milestone */}
                  {task.isMilestone ? (
                    <div
                      className="absolute cursor-pointer"
                      style={{
                        left: bar.left + bar.width / 2 - 8,
                        top: ROW_HEIGHT / 2 - 8,
                      }}
                      onClick={() => onTaskClick(task.id)}
                      title={`${task.title}${task.assignee ? ` (${task.assignee.name})` : ""}`}
                    >
                      <div
                        className={cn(
                          "size-4 rotate-45 border-2",
                          statusColor,
                          borderColor
                        )}
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "absolute rounded-sm cursor-pointer border transition-opacity hover:opacity-80",
                        statusColor,
                        borderColor
                      )}
                      style={{
                        left: bar.left,
                        width: Math.max(bar.width, colWidth / 2),
                        top: 8,
                        height: ROW_HEIGHT - 16,
                      }}
                      onClick={() => onTaskClick(task.id)}
                      title={`${task.title}${task.assignee ? ` (${task.assignee.name})` : ""}`}
                    >
                      {bar.width > 60 && (
                        <span className="text-[10px] text-white px-1 truncate block leading-[20px]">
                          {task.title}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Today marker */}
            {todayOffset !== null && (
              <div
                className="absolute top-0 pointer-events-none"
                style={{
                  left: todayOffset * colWidth + colWidth / 2,
                  height: HEADER_HEIGHT + tasks.length * ROW_HEIGHT,
                }}
              >
                <div className="w-px h-full border-l-2 border-dashed border-red-500" />
              </div>
            )}

            {/* Dependency arrows (SVG overlay) */}
            {dependencies.length > 0 && (
              <svg
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  width: timelineWidth,
                  height: HEADER_HEIGHT + tasks.length * ROW_HEIGHT,
                }}
              >
                {dependencies.map((dep, i) => {
                  const fromRow = taskRowMap.get(dep.dependencyTaskId);
                  const toRow = taskRowMap.get(dep.dependentTaskId);
                  if (fromRow === undefined || toRow === undefined) return null;

                  const fromTask = taskDates[fromRow];
                  const toTask = taskDates[toRow];
                  if (!fromTask || !toTask) return null;

                  const fromBar = getBarStyle(fromTask.start, fromTask.end);
                  const toBar = getBarStyle(toTask.start, toTask.end);

                  // Arrow starts at end of dependency bar, ends at start of dependent bar
                  const x1 = fromBar.left + fromBar.width;
                  const y1 = HEADER_HEIGHT + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const x2 = toBar.left;
                  const y2 = HEADER_HEIGHT + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const midX = (x1 + x2) / 2;

                  return (
                    <g key={i}>
                      {/* Right-angle connector line */}
                      <path
                        d={`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        className="text-muted-foreground/60"
                        strokeDasharray="4 2"
                      />
                      {/* Arrow head */}
                      <polygon
                        points={`${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`}
                        className="fill-muted-foreground/60"
                      />
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t text-[11px] text-muted-foreground bg-muted/20">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={cn("size-2.5 rounded-sm", color)} />
            {status.replace("_", " ")}
          </span>
        ))}
        <span className="flex items-center gap-1 ml-2">
          <span className="size-2.5 rotate-45 border border-gray-400 bg-gray-400" />
          milestone
        </span>
      </div>
    </div>
  );
}
