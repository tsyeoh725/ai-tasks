"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Target } from "lucide-react";

type Goal = {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
  progress?: number;
  parentGoalId?: string | null;
};

const STATUS_DOT: Record<string, string> = {
  not_started: "bg-gray-400",
  on_track: "bg-green-500",
  at_risk: "bg-yellow-500",
  off_track: "bg-red-500",
  achieved: "bg-blue-500",
};

function GoalNode({
  goal,
  childNodes,
  depth = 0,
}: {
  goal: Goal;
  childNodes: React.ReactNode;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!childNodes;
  const statusDot = STATUS_DOT[goal.status || "not_started"] || "bg-gray-400";
  const progress = goal.progress ?? 0;

  return (
    <div className={cn("relative", depth > 0 && "ml-6 pl-4 border-l border-gray-200 dark:border-white/10")}>
      <div
        className={cn(
          "flex items-start gap-2 p-2.5 rounded-lg border transition-colors cursor-pointer",
          "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10",
          "hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:shadow-sm"
        )}
        onClick={() => setExpanded((e) => !e)}
      >
        {hasChildren ? (
          <button type="button" className="shrink-0 mt-0.5 text-gray-400">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
        ) : (
          <Target className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full shrink-0", statusDot)} />
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{goal.title}</p>
          </div>
          {goal.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{goal.description}</p>
          )}
          {progress > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">{progress}%</span>
            </div>
          )}
        </div>
      </div>

      {hasChildren && expanded && (
        <div className="mt-1.5 space-y-1.5">{childNodes}</div>
      )}
    </div>
  );
}

function buildTree(goals: Goal[], parentId: string | null, depth: number): React.ReactNode {
  const nodes = goals.filter((g) => (g.parentGoalId ?? null) === parentId);
  if (nodes.length === 0) return null;
  return (
    <>
      {nodes.map((goal) => (
        <GoalNode key={goal.id} goal={goal} depth={depth} childNodes={buildTree(goals, goal.id, depth + 1)} />
      ))}
    </>
  );
}

export function GoalsMindMap({ goals }: { goals: Goal[] }) {
  if (goals.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
        <Target className="h-10 w-10 mb-2 opacity-30" />
        <p className="text-sm">No goals yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-auto min-h-[400px] space-y-1.5">
      {buildTree(goals, null, 0)}
    </div>
  );
}
