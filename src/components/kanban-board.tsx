"use client";

import { useEffect, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueDate: string | null;
  assignee?: { name: string } | null;
  subtasks?: { isDone: boolean }[];
  sectionId?: string | null;
};

type Section = {
  id: string;
  name: string;
  sortOrder: number;
};

type Props = {
  tasks: Task[];
  projectId: string;
  onTaskMove: (taskId: string, newStatus: string) => void;
  onRefresh: () => void;
  sections?: Section[];
  onTaskSectionMove?: (taskId: string, newSectionId: string) => void;
};

const statusColumns = [
  { id: "todo", title: "To Do", color: "bg-slate-500" },
  { id: "in_progress", title: "In Progress", color: "bg-blue-500" },
  { id: "done", title: "Done", color: "bg-green-500" },
  { id: "blocked", title: "Blocked", color: "bg-red-500" },
];

const priorityColors: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-400",
};

export function KanbanBoard({ tasks, projectId, onTaskMove, onRefresh, sections, onTaskSectionMove }: Props) {
  const useSections = !!sections && sections.length > 0;
  const [isMobile, setIsMobile] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    const destId = result.destination.droppableId;
    const taskId = result.draggableId;
    if (destId === result.source.droppableId) return;

    if (useSections && onTaskSectionMove) {
      onTaskSectionMove(taskId, destId);
    } else {
      onTaskMove(taskId, destId);
    }
  }

  // Build the list of columns for the mobile chip row + swipe deck
  const mobileColumns: Array<{
    key: string;
    droppableId: string;
    title: string;
    dotClass: string;
    tasks: Task[];
    createDefaultStatus?: string;
    createSectionId?: string;
  }> = useSections
    ? sections!.map((section) => ({
        key: section.id,
        droppableId: section.id,
        title: section.name,
        dotClass: "bg-indigo-500",
        tasks: tasks.filter((t) => t.sectionId === section.id),
        createSectionId: section.id,
      }))
    : statusColumns.map((col) => ({
        key: col.id,
        droppableId: col.id,
        title: col.title,
        dotClass: col.color,
        tasks: tasks.filter((t) => t.status === col.id),
        createDefaultStatus: col.id,
      }));

  function scrollToIdx(idx: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
    setActiveIdx(idx);
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (idx !== activeIdx) setActiveIdx(idx);
  }

  if (isMobile) {
    return (
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex flex-col h-full">
          {/* Chip row */}
          <div className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none shrink-0">
            {mobileColumns.map((col, idx) => (
              <button
                key={col.key}
                type="button"
                onClick={() => scrollToIdx(idx)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  idx === activeIdx
                    ? "bg-foreground text-background border-foreground"
                    : "bg-muted/50 text-muted-foreground border-transparent"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", col.dotClass)} />
                <span className="whitespace-nowrap">{col.title}</span>
                <span
                  className={cn(
                    "text-[10px] rounded-full px-1.5 py-0.5",
                    idx === activeIdx ? "bg-background/20" : "bg-background/60"
                  )}
                >
                  {col.tasks.length}
                </span>
              </button>
            ))}
            {useSections && (
              <div className="shrink-0">
                <AddSectionColumn projectId={projectId} onCreated={onRefresh} variant="chip" />
              </div>
            )}
          </div>

          {/* Swipe deck */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-none"
          >
            {mobileColumns.map((col) => (
              <div
                key={col.key}
                className="shrink-0 w-full snap-start snap-always h-full flex flex-col"
              >
                <BoardColumn
                  droppableId={col.droppableId}
                  title={col.title}
                  dotClass={col.dotClass}
                  tasks={col.tasks}
                  projectId={projectId}
                  onRefresh={onRefresh}
                  createDefaultStatus={col.createDefaultStatus}
                  createSectionId={col.createSectionId}
                  fullWidth
                />
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto p-4 h-full">
        {useSections ? (
          <>
            {sections!.map((section) => {
              const columnTasks = tasks.filter((t) => t.sectionId === section.id);
              return (
                <BoardColumn
                  key={section.id}
                  droppableId={section.id}
                  title={section.name}
                  dotClass="bg-indigo-500"
                  tasks={columnTasks}
                  projectId={projectId}
                  onRefresh={onRefresh}
                  createSectionId={section.id}
                />
              );
            })}
            <AddSectionColumn projectId={projectId} onCreated={onRefresh} />
          </>
        ) : (
          statusColumns.map((col) => {
            const columnTasks = tasks.filter((t) => t.status === col.id);
            return (
              <BoardColumn
                key={col.id}
                droppableId={col.id}
                title={col.title}
                dotClass={col.color}
                tasks={columnTasks}
                projectId={projectId}
                onRefresh={onRefresh}
                createDefaultStatus={col.id}
              />
            );
          })
        )}
      </div>
    </DragDropContext>
  );
}

type ColumnProps = {
  droppableId: string;
  title: string;
  dotClass: string;
  tasks: Task[];
  projectId: string;
  onRefresh: () => void;
  createDefaultStatus?: string;
  createSectionId?: string;
  fullWidth?: boolean;
};

function BoardColumn({ droppableId, title, dotClass, tasks, projectId, onRefresh, createDefaultStatus, createSectionId, fullWidth }: ColumnProps) {
  return (
    <div className={cn("flex flex-col bg-muted/50 rounded-lg", fullWidth ? "w-full h-full mx-3 mb-3" : "min-w-[280px] w-[280px]")}>
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
          <span className="font-medium text-sm">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        </div>
        <CreateTaskDialog
          projectId={projectId}
          defaultStatus={createDefaultStatus}
          defaultSectionId={createSectionId}
          onCreated={onRefresh}
          trigger={
            <button
              type="button"
              className="h-8 w-8 md:h-7 md:w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label={`Add task to ${title}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          }
        />
      </div>

      <Droppable droppableId={droppableId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px] transition-colors ${
              snapshot.isDraggingOver ? "bg-accent/50" : ""
            }`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, snapshot) => (
                  <Link href={`/tasks/${task.id}`}>
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`p-3 bg-card rounded-md border border-l-4 ${
                        priorityColors[task.priority] || "border-l-gray-400"
                      } shadow-sm hover:shadow-md transition-shadow ${
                        snapshot.isDragging ? "shadow-lg ring-2 ring-primary/20" : ""
                      }`}
                    >
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      <div className="flex items-center gap-2 mt-2">
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {task.subtasks.filter((s) => s.isDone).length}/{task.subtasks.length}
                          </span>
                        )}
                        {task.assignee && (
                          <span className="ml-auto text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                            {task.assignee.name.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

function AddSectionColumn({ projectId, onCreated, variant = "column" }: { projectId: string; onCreated: () => void; variant?: "column" | "chip" }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        setEditing(false);
        onCreated();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    if (variant === "chip") {
      return (
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-muted-foreground/80 transition-colors"
          type="button"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Section
        </button>
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center justify-center min-w-[280px] w-[280px] rounded-lg border-2 border-dashed border-muted-foreground/30 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/60 transition-colors"
        type="button"
      >
        <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add section
      </button>
    );
  }

  if (variant === "chip") {
    return (
      <form
        onSubmit={handleSubmit}
        className="shrink-0 inline-flex items-center gap-1 bg-muted/50 rounded-full px-2 py-1"
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="h-6 text-xs w-28"
        />
        <Button type="submit" size="sm" className="h-6 px-2 text-xs" disabled={!name.trim() || submitting}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => { setEditing(false); setName(""); }}
        >
          ×
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col min-w-[280px] w-[280px] bg-muted/50 rounded-lg p-3 gap-2"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Section name..."
        className="h-8 text-sm"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim() || submitting}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setEditing(false);
            setName("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
