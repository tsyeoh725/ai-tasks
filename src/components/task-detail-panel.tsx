// Stub for the slide-in task detail panel. Real implementation TBD;
// keeping the panel closed (returns null when open=false) so the
// existing tasks page works without errors.

export function TaskDetailPanel({
  taskId: _taskId,
  open,
  onOpenChange,
  onUpdate: _onUpdate,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-96 border-l bg-background p-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="font-medium">Task details</div>
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>
      <div className="mt-6 text-sm text-muted-foreground">
        Detail panel UI is not built yet.
      </div>
    </div>
  );
}
