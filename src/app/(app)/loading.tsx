export default function AppLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-7 w-48 bg-slate-200 rounded-lg" />
      <div className="h-4 w-72 bg-slate-100 rounded" />
      <div className="grid grid-cols-2 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 bg-slate-100 rounded-xl" />
        ))}
      </div>
      <div className="h-48 bg-slate-100 rounded-xl mt-4" />
    </div>
  );
}
