// Lightweight visual indicator used by various project pages.
// The PR that referenced this didn't ship the file — minimal stub
// so consumers compile and render correctly.

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "w-5 h-5 text-[10px]",
  md: "w-7 h-7 text-xs",
  lg: "w-10 h-10 text-base",
};

export function ProjectColorDot({
  icon,
  color,
  size = "md",
}: {
  icon?: string | null;
  color?: string | null;
  size?: Size;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-md ${SIZE_CLASS[size]}`}
      style={{ backgroundColor: color ?? "#6366f1" }}
    >
      {icon ? <span>{icon}</span> : null}
    </div>
  );
}
