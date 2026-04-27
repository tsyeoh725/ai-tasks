"use client";

import { useCallback } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type Goal = {
  id: string;
  title: string;
  status: string;
  progress: number;
  parentGoalId: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "#94a3b8",
  on_track: "#22c55e",
  at_risk: "#f59e0b",
  off_track: "#ef4444",
  achieved: "#3b82f6",
};

function buildGraph(goals: Goal[]): { nodes: Node[]; edges: Edge[] } {
  const COLS = 3;
  const COL_W = 260;
  const ROW_H = 130;

  const nodes: Node[] = goals.map((g, i) => ({
    id: g.id,
    position: { x: (i % COLS) * COL_W, y: Math.floor(i / COLS) * ROW_H },
    data: {
      label: (
        <div className="p-2 text-left">
          <div
            className="h-1.5 rounded-full mb-1"
            style={{ backgroundColor: STATUS_COLORS[g.status] ?? "#94a3b8", width: `${g.progress}%`, minWidth: 4 }}
          />
          <p className="text-xs font-medium leading-tight line-clamp-2">{g.title}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{g.progress}%</p>
        </div>
      ),
    },
    style: {
      borderColor: STATUS_COLORS[g.status] ?? "#94a3b8",
      borderWidth: 2,
      borderRadius: 8,
      background: "var(--background)",
      width: 220,
      fontSize: 12,
      padding: 0,
    },
  }));

  const edges: Edge[] = goals
    .filter((g) => g.parentGoalId)
    .map((g) => ({
      id: `e-${g.parentGoalId}-${g.id}`,
      source: g.parentGoalId!,
      target: g.id,
      animated: true,
      style: { stroke: STATUS_COLORS[g.status] ?? "#94a3b8" },
    }));

  return { nodes, edges };
}

export function GoalsMindMap({ goals }: { goals: Goal[] }) {
  const { nodes: initNodes, edges: initEdges } = buildGraph(goals);
  const [nodes, , onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div className="h-[600px] w-full rounded-lg border overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        colorMode="system"
      >
        <Controls />
        <MiniMap />
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}
