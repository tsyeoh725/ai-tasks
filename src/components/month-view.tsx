"use client"

import { useMemo } from "react"
import {
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isToday,
  format,
  parseISO,
} from "date-fns"
import { cn } from "@/lib/utils"
import {
  CATEGORY_COLORS,
  type TimeBlock,
} from "@/components/schedule-timeline"

type MonthViewProps = {
  month: Date
  blocks: TimeBlock[]
  onBlockClick: (block: TimeBlock) => void
  onDayClick?: (date: Date) => void
}

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_VISIBLE_PILLS = 3

export function MonthView({
  month,
  blocks,
  onBlockClick,
  onDayClick,
}: MonthViewProps) {
  const calendarStart = useMemo(
    () => startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    [month]
  )
  const calendarEnd = useMemo(
    () => endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    [month]
  )

  const days = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd]
  )

  const blocksByDayKey = useMemo(() => {
    const map = new Map<string, TimeBlock[]>()
    for (const block of blocks) {
      const d = parseISO(block.startTime)
      const key = format(d, "yyyy-MM-dd")
      const arr = map.get(key)
      if (arr) arr.push(block)
      else map.set(key, [block])
    }
    // Sort each day's blocks by start time
    for (const [, arr] of map) {
      arr.sort((a, b) => parseISO(a.startTime).getTime() - parseISO(b.startTime).getTime())
    }
    return map
  }, [blocks])

  function getBlocksForDay(day: Date): TimeBlock[] {
    return blocksByDayKey.get(format(day, "yyyy-MM-dd")) || []
  }

  const categoryDot = (category: string): string => {
    const c = CATEGORY_COLORS[category] || CATEGORY_COLORS.admin
    return c.hex
  }

  return (
    <div className="flex flex-col">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-xs font-medium text-muted-foreground text-center"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month)
          const today = isToday(day)
          const dayBlocks = getBlocksForDay(day)
          const visible = dayBlocks.slice(0, MAX_VISIBLE_PILLS)
          const overflow = dayBlocks.length - visible.length

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "border-b border-r border-border min-h-28 p-1.5 flex flex-col gap-1 cursor-pointer transition-colors hover:bg-accent/20",
                !inMonth && "bg-muted/20",
                today && "bg-primary/10"
              )}
              onClick={() => onDayClick?.(day)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs",
                    !inMonth && "text-muted-foreground/60",
                    inMonth && "text-foreground",
                    today && "font-bold"
                  )}
                >
                  {format(day, "d")}
                </span>
                {dayBlocks.length > 0 && (
                  <span className="text-[9px] text-muted-foreground">
                    {dayBlocks.length}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-0.5">
                {visible.map((block) => (
                  <button
                    key={block.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onBlockClick(block)
                    }}
                    className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] hover:bg-accent/60 text-left w-full"
                    title={block.title}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: categoryDot(block.category) }}
                    />
                    <span className="truncate flex-1">{block.title}</span>
                  </button>
                ))}
                {overflow > 0 && (
                  <span className="px-1 text-[10px] text-muted-foreground">
                    +{overflow} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export type { MonthViewProps }
