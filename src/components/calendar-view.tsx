"use client"

import { useState } from "react"
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  addMonths,
  subMonths,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
  isSameMonth,
} from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface Task {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  assignee?: { name: string } | null
}

interface CalendarViewProps {
  tasks: Task[]
  onTaskClick: (taskId: string) => void
  onDateChange: (taskId: string, newDate: string) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/20",
  high: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20",
  medium: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
  low: "bg-gray-500/15 text-gray-700 dark:text-gray-400 border-gray-500/20",
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function CalendarView({ tasks, onTaskClick }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  function getTasksForDay(day: Date) {
    return tasks.filter((task) => {
      if (!task.dueDate) return false
      return isSameDay(new Date(task.dueDate), day)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b">
          {DAY_HEADERS.map((day) => (
            <div
              key={day}
              className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const dayTasks = getTasksForDay(day)
            const inCurrentMonth = isSameMonth(day, currentMonth)
            const today = isToday(day)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "min-h-24 border-b border-r p-1",
                  index % 7 === 6 && "border-r-0",
                  index >= days.length - 7 && "border-b-0",
                  !inCurrentMonth && "bg-muted/30"
                )}
              >
                {/* Day number */}
                <div className="mb-0.5 flex justify-end">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-xs",
                      today && "bg-primary text-primary-foreground font-semibold",
                      !today && inCurrentMonth && "text-foreground",
                      !today && !inCurrentMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                {/* Task pills */}
                <div className="flex flex-col gap-0.5">
                  {dayTasks.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick(task.id)}
                      className={cn(
                        "w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium leading-tight transition-opacity hover:opacity-80",
                        PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.low
                      )}
                      title={task.title}
                    >
                      {task.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{dayTasks.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
