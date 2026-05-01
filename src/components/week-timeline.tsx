"use client"

import { useMemo, useState } from "react"
import {
  format,
  parseISO,
  differenceInMinutes,
  addDays,
  isSameDay,
  isToday,
} from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  CATEGORY_COLORS,
  CATEGORY_EMOJIS,
  type TimeBlock,
} from "@/components/schedule-timeline"

type WeekTimelineProps = {
  weekStart: Date
  blocks: TimeBlock[]
  workStartTime: string
  workEndTime: string
  lunchStartTime: string
  lunchEndTime: string
  onBlockClick: (block: TimeBlock) => void
  onConfirmBlock: (blockId: string) => void
  onDeleteBlock: (blockId: string) => void
}

const SLOT_HEIGHT = 40
const SLOT_MINUTES = 30

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function generateTimeSlots(startTime: string, endTime: string): string[] {
  const startMinutes = parseTimeToMinutes(startTime)
  const endMinutes = parseTimeToMinutes(endTime)
  const slots: string[] = []
  for (let m = startMinutes; m < endMinutes; m += SLOT_MINUTES) {
    const hours = Math.floor(m / 60)
    const mins = m % 60
    slots.push(`${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`)
  }
  return slots
}

export function WeekTimeline({
  weekStart,
  blocks,
  workStartTime,
  workEndTime,
  lunchStartTime,
  lunchEndTime,
  onBlockClick,
  onConfirmBlock,
  onDeleteBlock,
}: WeekTimelineProps) {
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null)

  const timeSlots = useMemo(
    () => generateTimeSlots(workStartTime, workEndTime),
    [workStartTime, workEndTime]
  )

  const workStartMinutes = parseTimeToMinutes(workStartTime)
  const totalMinutes = parseTimeToMinutes(workEndTime) - workStartMinutes
  const totalHeight = (totalMinutes / SLOT_MINUTES) * SLOT_HEIGHT

  const lunchStartMinutes = parseTimeToMinutes(lunchStartTime)
  const lunchEndMinutes = parseTimeToMinutes(lunchEndTime)
  const lunchTopPx = ((lunchStartMinutes - workStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
  const lunchHeightPx = ((lunchEndMinutes - lunchStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT

  // Build an array of 7 day Dates starting from weekStart (Mon)
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  // Group blocks by day index
  const blocksByDay = useMemo(() => {
    const map: Record<number, TimeBlock[]> = {}
    for (let i = 0; i < 7; i++) map[i] = []
    for (const block of blocks) {
      const d = parseISO(block.startTime)
      for (let i = 0; i < 7; i++) {
        if (isSameDay(d, days[i])) {
          map[i].push(block)
          break
        }
      }
    }
    return map
  }, [blocks, days])

  const colors = (category: string) =>
    CATEGORY_COLORS[category] || CATEGORY_COLORS.admin

  function getBlockPosition(block: TimeBlock) {
    const blockStart = parseISO(block.startTime)
    const blockEnd = parseISO(block.endTime)
    const startMins = blockStart.getHours() * 60 + blockStart.getMinutes()
    const endMins = blockEnd.getHours() * 60 + blockEnd.getMinutes()
    const topPx = ((startMins - workStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
    const heightPx = ((endMins - startMins) / SLOT_MINUTES) * SLOT_HEIGHT
    const durationMins = differenceInMinutes(blockEnd, blockStart)
    return { topPx, heightPx: Math.max(heightPx, SLOT_HEIGHT / 2), durationMins }
  }

  return (
    <div className="relative select-none overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header row with day labels */}
        <div className="flex border-b sticky top-0 bg-background z-20">
          <div className="w-16 shrink-0" />
          {days.map((day, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 min-w-32 border-l border-border px-2 py-2 text-xs",
                isToday(day) && "bg-accent/30"
              )}
            >
              <div className="font-medium">{format(day, "EEE")}</div>
              <div
                className={cn(
                  "text-muted-foreground",
                  isToday(day) && "text-foreground font-semibold"
                )}
              >
                {format(day, "MMM d")}
              </div>
            </div>
          ))}
        </div>

        {/* Timeline body */}
        <div className="relative flex" style={{ height: totalHeight }}>
          {/* Time labels column */}
          <div className="w-16 shrink-0 relative">
            {timeSlots.map((slot, i) => (
              <div
                key={slot}
                className="absolute right-2 text-xs text-muted-foreground/70 leading-none font-mono"
                style={{ top: i * SLOT_HEIGHT - 6 }}
              >
                {slot}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const dayBlocks = blocksByDay[dayIdx] || []
            const highlight = isToday(day)
            return (
              <div
                key={dayIdx}
                className={cn(
                  "flex-1 min-w-32 relative border-l border-border",
                  highlight && "bg-accent/30"
                )}
              >
                {/* Grid lines */}
                {timeSlots.map((slot, i) => (
                  <div
                    key={slot}
                    className={cn(
                      "absolute left-0 right-0 border-t border-border/50",
                      i % 2 === 0 && "border-border"
                    )}
                    style={{ top: i * SLOT_HEIGHT }}
                  />
                ))}

                {/* Lunch zone */}
                <div
                  className="absolute left-0 right-0 z-0"
                  style={{ top: lunchTopPx, height: lunchHeightPx }}
                >
                  <div
                    className="w-full h-full opacity-30"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(107,114,128,0.2) 4px, rgba(107,114,128,0.2) 8px)",
                      backgroundColor: "rgba(107,114,128,0.08)",
                    }}
                  />
                </div>

                {/* Blocks */}
                {dayBlocks.map((block) => {
                  const { topPx, heightPx, durationMins } = getBlockPosition(block)
                  const c = colors(block.category)
                  const isAiProposed = block.aiGenerated && !block.isLocked
                  const isEvent = block.type === "event"
                  const isHovered = hoveredBlockId === block.id

                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "absolute left-1 right-1 z-10 rounded-md px-1.5 py-1 cursor-pointer transition-all duration-300 overflow-hidden animate-in fade-in",
                        isEvent
                          ? "bg-blue-500 text-white border border-blue-600"
                          : isAiProposed
                            ? cn(c.bg, c.text, "border-2 border-dashed", c.border, "opacity-75")
                            : cn(c.bg, c.text, "border border-solid", c.border)
                      )}
                      style={{ top: topPx, height: heightPx }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onBlockClick(block)
                      }}
                      onMouseEnter={() => setHoveredBlockId(block.id)}
                      onMouseLeave={() => setHoveredBlockId(null)}
                    >
                      <div className="flex items-start justify-between gap-1 h-full">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] leading-none">
                              {CATEGORY_EMOJIS[block.category] || "\u{1F4CC}"}
                            </span>
                            <span className="text-[11px] font-medium truncate">
                              {block.title}
                            </span>
                          </div>
                          {heightPx >= SLOT_HEIGHT && (
                            <div className="text-[9px] opacity-70 mt-0.5 truncate">
                              {format(parseISO(block.startTime), "HH:mm")}-
                              {format(parseISO(block.endTime), "HH:mm")} ({durationMins}m)
                            </div>
                          )}
                        </div>

                        {isHovered && isAiProposed && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                onConfirmBlock(block.id)
                              }}
                            >
                              <span className="text-[10px]">{"\u2713"}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/20"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteBlock(block.id)
                              }}
                            >
                              <span className="text-[10px]">{"\u2717"}</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export type { WeekTimelineProps }
