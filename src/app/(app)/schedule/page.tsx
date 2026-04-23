"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  format,
  addDays,
  subDays,
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
} from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  ScheduleTimeline,
  CATEGORY_COLORS,
  type TimeBlock,
} from "@/components/schedule-timeline"
import { WeekTimeline } from "@/components/week-timeline"
import { MonthView } from "@/components/month-view"

type ViewMode = "day" | "week" | "month"

type Task = {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  estimatedHours: number | null
}

type ScheduleWarning = {
  taskId: string
  title: string
  reason: string
}

function formatEstimate(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h === 1) return "1h"
  return `${h}h`
}

type Preferences = {
  workStartTime: string
  workEndTime: string
  lunchStartTime: string
  lunchEndTime: string
  focusPreference: string
}

const DEFAULT_PREFERENCES: Preferences = {
  workStartTime: "09:00",
  workEndTime: "17:00",
  lunchStartTime: "12:00",
  lunchEndTime: "13:00",
  focusPreference: "morning",
}

const PRIORITY_DOT_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-blue-500",
}

const STATUS_STYLES: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  blocked: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
}

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()))
  const [viewMode, setViewMode] = useState<ViewMode>("day")
  const [blocks, setBlocks] = useState<TimeBlock[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [editPrefs, setEditPrefs] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [showSettings, setShowSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ScheduleWarning[]>([])
  // Wider-range block fetch used to identify which tasks are "scheduled"
  // (so they can be excluded from the unscheduled-tasks sidebar)
  const [allScheduledTaskIds, setAllScheduledTaskIds] = useState<Set<string>>(new Set())

  // Show toast helper
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }, [])

  // Fetch preferences
  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.workStartTime) {
          setPreferences(data)
          setEditPrefs(data)
        }
      })
      .catch(() => {})
  }, [])

  const syncedRef = useRef(false)

  // Fetch blocks for the current date range — varies by viewMode
  const fetchBlocks = useCallback(() => {
    // Use local midnight to midnight range — toISOString converts to UTC
    // but server's gte/lte comparison on timestamps is correct as long as both
    // bounds correctly represent the user's local day boundary
    let localStart: Date
    let localEnd: Date
    if (viewMode === "day") {
      localStart = new Date(currentDate)
      localStart.setHours(0, 0, 0, 0)
      localEnd = new Date(currentDate)
      localEnd.setHours(23, 59, 59, 999)
    } else if (viewMode === "week") {
      localStart = startOfWeek(currentDate, { weekStartsOn: 1 })
      localStart.setHours(0, 0, 0, 0)
      localEnd = endOfWeek(currentDate, { weekStartsOn: 1 })
      localEnd.setHours(23, 59, 59, 999)
    } else {
      localStart = startOfMonth(currentDate)
      localStart.setHours(0, 0, 0, 0)
      localEnd = endOfMonth(currentDate)
      localEnd.setHours(23, 59, 59, 999)
    }
    const start = localStart.toISOString()
    const end = localEnd.toISOString()
    fetch(`/api/schedule/blocks?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setBlocks(data)
        } else if (data?.blocks) {
          setBlocks(data.blocks)
        }
      })
      .catch(() => setBlocks([]))
      .finally(() => setLoading(false))
  }, [currentDate, viewMode])

  useEffect(() => {
    setLoading(true)
    fetchBlocks()
  }, [fetchBlocks])

  // Auto-sync on first mount: places each task on its due date
  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    fetch("/api/schedule/auto-sync", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.warnings)) setWarnings(data.warnings)
        fetchBlocks()
        // Follow-up fetch to catch any blocks that might have been delayed
        setTimeout(() => fetchBlocks(), 500)
      })
      .catch(() => {})
  }, [fetchBlocks])

  // Fetch unscheduled tasks
  const fetchTasks = useCallback(() => {
    fetch("/api/tasks?assignedToMe=true")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.tasks ?? []
        setTasks(list)
      })
      .catch(() => setTasks([]))
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  // Fetch blocks across a wide range (30 days back → 90 days forward) so we know
  // which tasks are already scheduled somewhere, even if the current view is a single day.
  const fetchAllScheduledIds = useCallback(() => {
    const wideStart = new Date()
    wideStart.setDate(wideStart.getDate() - 30)
    wideStart.setHours(0, 0, 0, 0)
    const wideEnd = new Date()
    wideEnd.setDate(wideEnd.getDate() + 90)
    wideEnd.setHours(23, 59, 59, 999)
    fetch(`/api/schedule/blocks?start=${encodeURIComponent(wideStart.toISOString())}&end=${encodeURIComponent(wideEnd.toISOString())}`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.blocks ?? []
        const ids = new Set<string>()
        for (const b of list) if (b?.taskId) ids.add(b.taskId)
        setAllScheduledTaskIds(ids)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchAllScheduledIds()
  }, [fetchAllScheduledIds, blocks])

  // Date navigation — step size depends on view mode
  const goToday = () => setCurrentDate(startOfDay(new Date()))
  const goPrev = () =>
    setCurrentDate((d) =>
      viewMode === "day" ? subDays(d, 1) : viewMode === "week" ? subWeeks(d, 1) : subMonths(d, 1)
    )
  const goNext = () =>
    setCurrentDate((d) =>
      viewMode === "day" ? addDays(d, 1) : viewMode === "week" ? addWeeks(d, 1) : addMonths(d, 1)
    )

  // Polling (every 15s) + focus/visibility-triggered refresh.
  // When the window regains focus or becomes visible, run auto-sync first so
  // tasks created in other tabs (AI command center, etc.) land in the view
  // immediately.
  useEffect(() => {
    const interval = setInterval(() => fetchBlocks(), 15000)
    const onFocus = () => {
      fetch("/api/schedule/auto-sync", { method: "POST" })
        .then(() => fetchBlocks())
        .catch(() => fetchBlocks())
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") onFocus()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [fetchBlocks])

  // Save preferences
  async function savePreferences() {
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editPrefs),
      })
      setPreferences(editPrefs)
      setShowSettings(false)
      showToast("Preferences saved")
    } catch {
      showToast("Failed to save preferences")
    }
  }

  // Manually refresh the schedule view (auto-sync runs automatically server-side whenever tasks change).
  // This is a fallback for when the user wants to force a re-computation (e.g. after editing work hours).
  async function generateSchedule() {
    setGenerating(true)
    try {
      const res = await fetch("/api/schedule/auto-sync", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (Array.isArray(data?.warnings)) setWarnings(data.warnings)
      else setWarnings([])
      fetchBlocks()
      showToast("Schedule refreshed")
    } catch {
      showToast("Failed to refresh schedule")
    } finally {
      setGenerating(false)
    }
  }

  // Confirm block
  async function confirmBlock(blockId: string) {
    try {
      await fetch(`/api/schedule/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isLocked: true }),
      })
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, isLocked: true } : b))
      )
    } catch {
      showToast("Failed to confirm block")
    }
  }

  // Delete block
  async function deleteBlock(blockId: string) {
    try {
      await fetch(`/api/schedule/blocks/${blockId}`, { method: "DELETE" })
      setBlocks((prev) => prev.filter((b) => b.id !== blockId))
    } catch {
      showToast("Failed to delete block")
    }
  }

  // Block click handler
  function handleBlockClick(block: TimeBlock) {
    if (block.taskId) {
      window.open(`/tasks/${block.taskId}`, "_blank")
    }
  }

  // Move / resize a block — PATCH the API and optimistically update local state.
  async function handleMoveBlock(blockId: string, newStartTime: Date, newEndTime: Date) {
    const startIso = newStartTime.toISOString()
    const endIso = newEndTime.toISOString()
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId ? { ...b, startTime: startIso, endTime: endIso } : b
      )
    )
    try {
      await fetch(`/api/schedule/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: startIso, endTime: endIso }),
      })
    } catch {
      showToast("Failed to move block")
    } finally {
      fetchBlocks()
    }
  }

  async function handleResizeBlock(blockId: string, newEndTime: Date) {
    const endIso = newEndTime.toISOString()
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, endTime: endIso } : b))
    )
    try {
      await fetch(`/api/schedule/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime: endIso }),
      })
    } catch {
      showToast("Failed to resize block")
    } finally {
      fetchBlocks()
    }
  }

  // Push to Google Calendar
  async function pushToCalendar() {
    setGenerating(true) // reuse existing generating state for the spinner
    try {
      const res = await fetch("/api/schedule/push-to-calendar", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || "Failed to push to calendar")
        return
      }
      showToast(`Pushed ${data.pushed} block${data.pushed === 1 ? "" : "s"} to Google Calendar`)
      fetchBlocks()
    } catch {
      showToast("Failed to push to calendar")
    } finally {
      setGenerating(false)
    }
  }

  // Sort unscheduled tasks by priority
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  // A task is "unscheduled" if it has no block anywhere in the 30-day-back/90-day-forward window.
  const unscheduledTasks = tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "cancelled" &&
        !allScheduledTaskIds.has(t.id)
    )
    .sort(
      (a, b) =>
        (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
    )

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-foreground text-background px-4 py-2 text-sm shadow-lg animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Schedule</h1>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={goPrev}>
              {"\u2190"}
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={goNext}>
              {"\u2192"}
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {viewMode === "day"
              ? format(currentDate, "EEEE, MMMM d, yyyy")
              : viewMode === "week"
                ? (() => {
                    const ws = startOfWeek(currentDate, { weekStartsOn: 1 })
                    const we = endOfWeek(currentDate, { weekStartsOn: 1 })
                    const sameMonth = ws.getMonth() === we.getMonth()
                    const sameYear = ws.getFullYear() === we.getFullYear()
                    if (sameMonth) {
                      return `${format(ws, "MMM d")}\u2013${format(we, "d, yyyy")}`
                    }
                    if (sameYear) {
                      return `${format(ws, "MMM d")}\u2013${format(we, "MMM d, yyyy")}`
                    }
                    return `${format(ws, "MMM d, yyyy")}\u2013${format(we, "MMM d, yyyy")}`
                  })()
                : format(currentDate, "MMMM yyyy")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditPrefs(preferences)
              setShowSettings((s) => !s)
            }}
          >
            {"\u2699"} Settings
          </Button>
          <div className="flex items-center rounded-md border p-0.5 text-xs">
            <button
              onClick={() => setViewMode("day")}
              className={cn(
                "px-2 py-1 rounded-sm",
                viewMode === "day" && "bg-accent"
              )}
            >
              Day
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={cn(
                "px-2 py-1 rounded-sm",
                viewMode === "week" && "bg-accent"
              )}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode("month")}
              className={cn(
                "px-2 py-1 rounded-sm",
                viewMode === "month" && "bg-accent"
              )}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="border-b bg-muted/30 px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Work Start
              </label>
              <input
                type="time"
                value={editPrefs.workStartTime}
                onChange={(e) =>
                  setEditPrefs((p) => ({ ...p, workStartTime: e.target.value }))
                }
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Lunch Start
              </label>
              <input
                type="time"
                value={editPrefs.lunchStartTime}
                onChange={(e) =>
                  setEditPrefs((p) => ({ ...p, lunchStartTime: e.target.value }))
                }
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Lunch End
              </label>
              <input
                type="time"
                value={editPrefs.lunchEndTime}
                onChange={(e) =>
                  setEditPrefs((p) => ({ ...p, lunchEndTime: e.target.value }))
                }
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Work End
              </label>
              <input
                type="time"
                value={editPrefs.workEndTime}
                onChange={(e) =>
                  setEditPrefs((p) => ({ ...p, workEndTime: e.target.value }))
                }
                className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Focus Preference
              </label>
              <Select
                value={editPrefs.focusPreference}
                onValueChange={(v) =>
                  v && setEditPrefs((p) => ({ ...p, focusPreference: v }))
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={savePreferences}>
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Timeline area */}
        <div className="flex-1 overflow-auto p-6">
          {/* Action buttons */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">
              Your time-blocked schedule. Tasks with due dates are auto-placed in your free time slots. Drag and drop not yet supported {"\u2014"} use task detail to change dates.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={generateSchedule}
                disabled={generating}
                title="Refresh schedule now"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <svg
                  className={cn("h-3.5 w-3.5", generating && "animate-spin")}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-xs">{generating ? "Refreshing..." : "Refresh"}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={pushToCalendar}>
                Push to Calendar
              </Button>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    {warnings.length === 1
                      ? "1 task couldn't fit before its deadline"
                      : `${warnings.length} tasks couldn't fit before their deadlines`}
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-amber-800 dark:text-amber-300">
                    {warnings.map((w) => (
                      <li key={w.taskId}>{"\u2022"} {w.title} {"\u2014"} {w.reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              Loading schedule...
            </div>
          ) : (
            <Card>
              <CardContent className="p-4">
                {viewMode === "day" && (
                  <ScheduleTimeline
                    blocks={blocks}
                    workStartTime={preferences.workStartTime}
                    workEndTime={preferences.workEndTime}
                    lunchStartTime={preferences.lunchStartTime}
                    lunchEndTime={preferences.lunchEndTime}
                    onBlockClick={handleBlockClick}
                    onConfirmBlock={confirmBlock}
                    onDeleteBlock={deleteBlock}
                    onMove={handleMoveBlock}
                    onResize={handleResizeBlock}
                  />
                )}
                {viewMode === "week" && (
                  <WeekTimeline
                    weekStart={startOfWeek(currentDate, { weekStartsOn: 1 })}
                    blocks={blocks}
                    workStartTime={preferences.workStartTime}
                    workEndTime={preferences.workEndTime}
                    lunchStartTime={preferences.lunchStartTime}
                    lunchEndTime={preferences.lunchEndTime}
                    onBlockClick={handleBlockClick}
                    onConfirmBlock={confirmBlock}
                    onDeleteBlock={deleteBlock}
                  />
                )}
                {viewMode === "month" && (
                  <MonthView
                    month={currentDate}
                    blocks={blocks}
                    onBlockClick={handleBlockClick}
                    onDayClick={(d) => {
                      setCurrentDate(startOfDay(d))
                      setViewMode("day")
                    }}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {/* Category legend */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {Object.entries(CATEGORY_COLORS).map(([category, c]) => (
              <div key={category} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="capitalize">{category.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar: Unscheduled Tasks */}
        <div className="w-72 shrink-0 border-l overflow-auto">
          <Card className="border-0 rounded-none shadow-none ring-0">
            <CardHeader>
              <CardTitle className="text-sm">Unscheduled Tasks</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {unscheduledTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No unscheduled tasks
                </p>
              ) : (
                <div className="flex flex-col">
                  {unscheduledTasks.map((task, index) => (
                    <div
                      key={task.id}
                      className={cn(
                        "rounded-md p-2.5 cursor-pointer transition-colors duration-150 hover:bg-accent/50",
                        index < unscheduledTasks.length - 1 && "border-b border-border/60 mb-0"
                      )}
                      onClick={() => window.open(`/tasks/${task.id}`, "_blank")}
                    >
                      <p className="text-xs font-medium truncate">
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="flex items-center gap-1">
                          <span
                            className={cn(
                              "inline-block h-2 w-2 rounded-full",
                              PRIORITY_DOT_COLORS[task.priority] || "bg-gray-400"
                            )}
                          />
                          <span className="text-[10px] font-medium text-muted-foreground capitalize">
                            {task.priority}
                          </span>
                        </span>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px] px-1.5 py-0 font-normal capitalize",
                            STATUS_STYLES[task.status] || STATUS_STYLES.todo
                          )}
                        >
                          {task.status.replace("_", " ")}
                        </Badge>
                      </div>
                      {(task.dueDate || task.estimatedHours) && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {task.dueDate && <>Due {format(new Date(task.dueDate), "MMM d")}</>}
                          {task.dueDate && task.estimatedHours ? " \u00b7 " : ""}
                          {task.estimatedHours ? formatEstimate(task.estimatedHours) : ""}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
