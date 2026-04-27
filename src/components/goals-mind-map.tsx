"use client";

// Stub for the goals mind-map view. Full graph implementation TBD —
// for now renders a simple list so the goals page compiles and the
// "mindmap" view falls back gracefully.

type Goal = {
  id: string;
  title: string;
  description?: string | null;
};

export function GoalsMindMap({ goals }: { goals: Goal[] }) {
  return (
    <div className="h-[600px] rounded-lg border border-dashed p-6 overflow-auto">
      <div className="text-sm text-muted-foreground mb-3">
        Mind map view — full visualization coming soon. Showing goals as a list:
      </div>
      <ul className="space-y-2">
        {goals.map((g) => (
          <li key={g.id} className="rounded border p-3">
            <div className="font-medium">{g.title}</div>
            {g.description ? (
              <div className="text-sm text-muted-foreground mt-1">{g.description}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
