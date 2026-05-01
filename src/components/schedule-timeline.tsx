"use client"

import { useMemo, useRef, useState } from "react"
import { format, parseISO } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type TimeBlock = {
  id: string
  title: string
  category: string
  startTime: string
  endTime: string
  isLocked: boolean
  aiGenerated: boolean
  taskId: string | null
  type?: "block" | "event"
}

type ScheduleTimelineProps = {
  blocks: TimeBlock[]
  workStartTime: string
  workEndTime: string
  lunchStartTime: string
  lunchEndTime: string
  onBlockClick: (block: TimeBlock) => void
  onConfirmBlock: (blockId: string) => void
  onDeleteBlock: (blockId: string) => void
  onMove?: (blockId: string, newStartTime: Date, newEndTime: Date) => void
  onResize?: (blockId: string, newEndTime: Date) => void
}

const SLOT_HEIGHT = 48
const SLOT_MINUTES = 30
const PX_PER_MINUTE = SLOT_HEIGHT / SLOT_MINUTES
const SNAP_MINUTES = 5
const MIN_DURATION_MINUTES = 10

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; hex: string }> = {
  deep_work: { bg: "bg-blue-500/15", border: "border-blue-500", text: "text-blue-700 dark:text-blue-300", hex: "#3b82f6" },
  creative: { bg: "bg-purple-500/15", border: "border-purple-500", text: "text-purple-700 dark:text-purple-300", hex: "#8b5cf6" },
  admin: { bg: "bg-amber-500/15", border: "border-amber-500", text: "text-amber-700 dark:text-amber-300", hex: "#f59e0b" },
  meeting: { bg: "bg-red-500/15", border: "border-red-500", text: "text-red-700 dark:text-red-300", hex: "#ef4444" },
  break: { bg: "bg-gray-500/15", border: "border-gray-500", text: "text-gray-700 dark:text-gray-300", hex: "#6b7280" },
  review: { bg: "bg-green-500/15", border: "border-green-500", text: "text-green-700 dark:text-green-300", hex: "#10b981" },
  quick_tasks: { bg: "bg-orange-500/15", border: "border-orange-500", text: "text-orange-700 dark:text-orange-300", hex: "#f97316" },
}

const CATEGORY_EMOJIS: Record<string, string> = {
  deep_work: "\u{1F9E0}",
  creative: "\u{1F3A8}",
  admin: "\u{1F4CB}",
  meeting: "\u{1F465}",
  break: "\u2615",
  review: "\u{1F50D}",
  quick_tasks: "\u26A1",
}

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

function snap(minutes: number, snapTo: number): number {
  return Math.round(minutes / snapTo) * snapTo
}

type InteractionState =
  | { kind: "idle" }
  | {
      kind: "drag"
      blockId: string
      originStartMins: number
      originEndMins: number
      pointerStartY: number
      startTimeIso: string
      endTimeIso: string
    }
  | {
      kind: "resize"
      blockId: string
      originStartMins: number
      originEndMins: number
      pointerStartY: number
      startTimeIso: string
      endTimeIso: string
    }

export function ScheduleTimeline({
  blocks,
  workStartTime,
  workEndTime,
  lunchStartTime,
  lunchEndTime,
  onBlockClick,
  onConfirmBlock,
  onDeleteBlock,
  onMove,
  onResize,
}: ScheduleTimelineProps) {
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null)
  const [interaction, setInteraction] = useState<InteractionState>({ kind: "idle" })
  // During an interaction we show a "preview" of the block's position.
  // Keyed by blockId so the rest of the list keeps their original positions.
  const [previewById, setPreviewById] = useState<
    Record<string, { startMins: number; endMins: number } | undefined>
  >({})
  // Track per-block pointer-down intent to distinguish click from drag
  const intentRef = useRef<{
    blockId: string
    pointerY: number
    pointerX: number
    moved: boolean
  } | null>(null)

  const timeSlots = useMemo(
    () => generateTimeSlots(workStartTime, workEndTime),
    [workStartTime, workEndTime]
  )

  const workStartMinutes = parseTimeToMinutes(workStartTime)
  const workEndMinutes = parseTimeToMinutes(workEndTime)
  const totalMinutes = workEndMinutes - workStartMinutes
  const totalHeight = (totalMinutes / SLOT_MINUTES) * SLOT_HEIGHT

  const lunchStartMinutes = parseTimeToMinutes(lunchStartTime)
  const lunchEndMinutes = parseTimeToMinutes(lunchEndTime)
  const lunchTopPx = ((lunchStartMinutes - workStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
  const lunchHeightPx = ((lunchEndMinutes - lunchStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT

  function getBlockPosition(block: TimeBlock) {
    const preview = previewById[block.id]
    const blockStartDate = parseISO(block.startTime)
    const blockEndDate = parseISO(block.endTime)
    const baseStartMins = blockStartDate.getHours() * 60 + blockStartDate.getMinutes()
    const baseEndMins = blockEndDate.getHours() * 60 + blockEndDate.getMinutes()

    const startMins = preview ? preview.startMins : baseStartMins
    const endMins = preview ? preview.endMins : baseEndMins
    const topPx = ((startMins - workStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT
    const heightPx = ((endMins - startMins) / SLOT_MINUTES) * SLOT_HEIGHT
    const durationMins = endMins - startMins
    return {
      topPx,
      heightPx: Math.max(heightPx, SLOT_HEIGHT / 2),
      durationMins,
      previewStartMins: startMins,
      previewEndMins: endMins,
    }
  }

  // Build an array of non-self block spans for collision detection.
  function otherBlockSpans(exceptId: string, dayIso: string): Array<{ start: number; end: number }> {
    const self = blocks.find((b) => b.id === exceptId)
    if (!self) return []
    const selfDayStart = new Date(parseISO(self.startTime))
    selfDayStart.setHours(0, 0, 0, 0)
    void dayIso
    const spans: Array<{ start: number; end: number }> = []
    for (const b of blocks) {
      if (b.id === exceptId) continue
      const bStart = parseISO(b.startTime)
      const bEnd = parseISO(b.endTime)
      const bDayStart = new Date(bStart)
      bDayStart.setHours(0, 0, 0, 0)
      // Only include blocks that are on the same day as the block being moved
      if (bDayStart.getTime() !== selfDayStart.getTime()) continue
      spans.push({
        start: bStart.getHours() * 60 + bStart.getMinutes(),
        end: bEnd.getHours() * 60 + bEnd.getMinutes(),
      })
    }
    return spans
  }

  // Compute the largest delta we can apply without hitting another block or the
  // lunch zone / work hours. `kind` controls whether we constrain both edges
  // (drag) or just the end edge (resize).
  function clampDelta(
    blockId: string,
    originStart: number,
    originEnd: number,
    deltaMins: number,
    kind: "drag" | "resize"
  ): number {
    const duration = originEnd - originStart
    const others = otherBlockSpans(blockId, "")

    // Work hours + lunch form the "forbidden" zones (in addition to other blocks)
    const forbidden: Array<{ start: number; end: number }> = [
      ...others,
      { start: Number.NEGATIVE_INFINITY, end: workStartMinutes },
      { start: workEndMinutes, end: Number.POSITIVE_INFINITY },
      { start: lunchStartMinutes, end: lunchEndMinutes },
    ]

    if (kind === "drag") {
      let newStart = originStart + deltaMins
      let newEnd = originEnd + deltaMins

      // Cap within work hours
      if (newStart < workStartMinutes) {
        newStart = workStartMinutes
        newEnd = newStart + duration
      }
      if (newEnd > workEndMinutes) {
        newEnd = workEndMinutes
        newStart = newEnd - duration
      }

      // If the proposed range overlaps a forbidden zone, shift in the opposite direction
      for (const zone of forbidden) {
        if (zone === forbidden[1] || zone === forbidden[2]) continue // skip the work-hour walls we already handled
        if (newStart < zone.end && newEnd > zone.start) {
          // overlap with zone
          if (deltaMins >= 0) {
            // moving forward — push to end of zone
            newStart = zone.end
            newEnd = newStart + duration
          } else {
            // moving backward — push to start of zone
            newEnd = zone.start
            newStart = newEnd - duration
          }
        }
      }

      return newStart - originStart
    } else {
      // resize: only bottom edge moves
      let newEnd = originEnd + deltaMins
      if (newEnd < originStart + MIN_DURATION_MINUTES) {
        newEnd = originStart + MIN_DURATION_MINUTES
      }
      if (newEnd > workEndMinutes) newEnd = workEndMinutes
      // Avoid crossing into lunch or other blocks
      for (const zone of forbidden) {
        // Skip the "work hour walls" since we already clamped with workEndMinutes
        if (zone === forbidden[1] || zone === forbidden[2]) continue
        // Zone entirely above the block start — ignore
        if (zone.end <= originStart) continue
        // Zone begins within or after the block start: cap newEnd at zone.start
        if (zone.start >= originStart && zone.start < newEnd) {
          newEnd = zone.start
        }
      }
      if (newEnd < originStart + MIN_DURATION_MINUTES) {
        newEnd = originStart + MIN_DURATION_MINUTES
      }
      return newEnd - originEnd
    }
  }

  function handlePointerDownBody(
    e: React.PointerEvent<HTMLDivElement>,
    block: TimeBlock
  ) {
    if (!onMove) return
    // Ignore clicks on buttons inside the block
    const target = e.target as HTMLElement
    if (target.closest("[data-resize-handle]") || target.closest("button")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const startDate = parseISO(block.startTime)
    const endDate = parseISO(block.endTime)
    const startMins = startDate.getHours() * 60 + startDate.getMinutes()
    const endMins = endDate.getHours() * 60 + endDate.getMinutes()
    intentRef.current = {
      blockId: block.id,
      pointerY: e.clientY,
      pointerX: e.clientX,
      moved: false,
    }
    setInteraction({
      kind: "drag",
      blockId: block.id,
      originStartMins: startMins,
      originEndMins: endMins,
      pointerStartY: e.clientY,
      startTimeIso: block.startTime,
      endTimeIso: block.endTime,
    })
  }

  function handlePointerDownResize(
    e: React.PointerEvent<HTMLDivElement>,
    block: TimeBlock
  ) {
    if (!onResize) return
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const startDate = parseISO(block.startTime)
    const endDate = parseISO(block.endTime)
    const startMins = startDate.getHours() * 60 + startDate.getMinutes()
    const endMins = endDate.getHours() * 60 + endDate.getMinutes()
    intentRef.current = {
      blockId: block.id,
      pointerY: e.clientY,
      pointerX: e.clientX,
      moved: true, // resize always counts as moved
    }
    setInteraction({
      kind: "resize",
      blockId: block.id,
      originStartMins: startMins,
      originEndMins: endMins,
      pointerStartY: e.clientY,
      startTimeIso: block.startTime,
      endTimeIso: block.endTime,
    })
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (interaction.kind === "idle") return
    const intent = intentRef.current
    if (intent && !intent.moved) {
      const dx = Math.abs(e.clientX - intent.pointerX)
      const dy = Math.abs(e.clientY - intent.pointerY)
      if (dx > 3 || dy > 3) intent.moved = true
    }
    const deltaPx = e.clientY - interaction.pointerStartY
    const rawDeltaMins = deltaPx / PX_PER_MINUTE
    const snappedDelta = snap(rawDeltaMins, SNAP_MINUTES)
    const clamped = clampDelta(
      interaction.blockId,
      interaction.originStartMins,
      interaction.originEndMins,
      snappedDelta,
      interaction.kind
    )

    if (interaction.kind === "drag") {
      const newStart = interaction.originStartMins + clamped
      const newEnd = interaction.originEndMins + clamped
      setPreviewById((prev) => ({
        ...prev,
        [interaction.blockId]: { startMins: newStart, endMins: newEnd },
      }))
    } else {
      const newEnd = interaction.originEndMins + clamped
      setPreviewById((prev) => ({
        ...prev,
        [interaction.blockId]: {
          startMins: interaction.originStartMins,
          endMins: newEnd,
        },
      }))
    }
  }

  function minutesToDateOnSameDay(originIso: string, targetMins: number): Date {
    const base = parseISO(originIso)
    const d = new Date(base)
    d.setHours(Math.floor(targetMins / 60), targetMins % 60, 0, 0)
    return d
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (interaction.kind === "idle") return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // pointer may not have been captured
    }

    const preview = previewById[interaction.blockId]
    const moved = intentRef.current?.moved ?? false

    if (preview && moved) {
      if (interaction.kind === "drag") {
        const newStart = minutesToDateOnSameDay(interaction.startTimeIso, preview.startMins)
        const newEnd = minutesToDateOnSameDay(interaction.endTimeIso, preview.endMins)
        // Only fire if actually changed
        if (
          preview.startMins !== interaction.originStartMins ||
          preview.endMins !== interaction.originEndMins
        ) {
          onMove?.(interaction.blockId, newStart, newEnd)
        }
      } else {
        const newEnd = minutesToDateOnSameDay(interaction.endTimeIso, preview.endMins)
        if (preview.endMins !== interaction.originEndMins) {
          onResize?.(interaction.blockId, newEnd)
        }
      }
    }

    setInteraction({ kind: "idle" })
    intentRef.current = null
    // Clear preview after a short delay so the parent refetch can replace the data
    setPreviewById((prev) => {
      const next = { ...prev }
      delete next[interaction.blockId]
      return next
    })
  }

  const colors = (category: string) =>
    CATEGORY_COLORS[category] || CATEGORY_COLORS.admin

  const isInteracting = interaction.kind !== "idle"

  return (
    <div className="relative select-none">
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

        {/* Timeline grid + blocks */}
        <div className="flex-1 relative border-l border-border">
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
            <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/60 italic font-medium pointer-events-none">
              Lunch
            </span>
          </div>

          {/* Time blocks */}
          {blocks.map((block) => {
            const {
              topPx,
              heightPx,
              durationMins,
              previewStartMins,
              previewEndMins,
            } = getBlockPosition(block)
            const c = colors(block.category)
            const isAiProposed = block.aiGenerated && !block.isLocked
            const isEvent = block.type === "event"
            const isHovered = hoveredBlockId === block.id
            const isDraggableBlock = !!onMove && !isEvent
            const isResizableBlock = !!onResize && !isEvent
            const isActive = interaction.kind !== "idle" && interaction.blockId === block.id
            // Derive the "live" start/end for the duration label during interaction
            const blockStartDate = parseISO(block.startTime)
            const displayStart = minutesToDateOnSameDay(block.startTime, previewStartMins)
            const displayEnd = minutesToDateOnSameDay(block.endTime, previewEndMins)
            void blockStartDate

            return (
              <div
                key={block.id}
                className={cn(
                  "absolute left-1 right-1 z-10 rounded-md px-2 py-1 transition-all duration-300 overflow-hidden animate-in fade-in",
                  isDraggableBlock
                    ? interaction.kind === "drag" && isActive
                      ? "cursor-grabbing"
                      : "cursor-grab"
                    : "cursor-pointer",
                  isActive && "shadow-lg ring-2 ring-blue-400/50 z-20",
                  isEvent
                    ? "bg-blue-500 text-white border border-blue-600"
                    : isAiProposed
                      ? cn(c.bg, c.text, "border-2 border-dashed", c.border, "opacity-75")
                      : cn(c.bg, c.text, "border border-solid", c.border)
                )}
                style={{ top: topPx, height: heightPx }}
                onPointerDown={(e) => {
                  if (isDraggableBlock) handlePointerDownBody(e, block)
                }}
                onPointerMove={(e) => {
                  if (isInteracting) handlePointerMove(e)
                }}
                onPointerUp={(e) => {
                  if (isInteracting) {
                    handlePointerUp(e)
                  }
                }}
                onPointerCancel={(e) => {
                  if (isInteracting) handlePointerUp(e)
                }}
                onClick={() => {
                  // Only treat as click if the pointer didn't move
                  if (intentRef.current?.moved) {
                    intentRef.current = null
                    return
                  }
                  onBlockClick(block)
                }}
                onMouseEnter={() => setHoveredBlockId(block.id)}
                onMouseLeave={() => setHoveredBlockId(null)}
              >
                <div className="flex items-start justify-between gap-1 h-full">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs leading-none">
                        {CATEGORY_EMOJIS[block.category] || "\u{1F4CC}"}
                      </span>
                      <span className="text-xs font-medium truncate">
                        {block.title}
                      </span>
                    </div>
                    {heightPx >= SLOT_HEIGHT && (
                      <div className="text-[10px] opacity-70 mt-0.5">
                        {format(displayStart, "HH:mm")} -{" "}
                        {format(displayEnd, "HH:mm")} ({durationMins}m)
                      </div>
                    )}
                  </div>

                  {/* Confirm / Delete buttons for AI-proposed blocks */}
                  {isHovered && isAiProposed && !isActive && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-green-600 hover:text-green-700 hover:bg-green-500/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          onConfirmBlock(block.id)
                        }}
                      >
                        <span className="text-xs">{"\u2713"}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteBlock(block.id)
                        }}
                      >
                        <span className="text-xs">{"\u2717"}</span>
                      </Button>
                    </div>
                  )}
                </div>

                {/* Resize handle */}
                {isResizableBlock && (
                  <div
                    data-resize-handle
                    className={cn(
                      "absolute bottom-0 left-0 h-1.5 w-full cursor-ns-resize",
                      (isHovered || isActive) ? "bg-foreground/20" : "bg-transparent"
                    )}
                    onPointerDown={(e) => handlePointerDownResize(e, block)}
                    onPointerMove={(e) => {
                      if (isInteracting) handlePointerMove(e)
                    }}
                    onPointerUp={(e) => {
                      if (isInteracting) handlePointerUp(e)
                    }}
                    onPointerCancel={(e) => {
                      if (isInteracting) handlePointerUp(e)
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export type { TimeBlock, ScheduleTimelineProps }
export { CATEGORY_COLORS, CATEGORY_EMOJIS }
