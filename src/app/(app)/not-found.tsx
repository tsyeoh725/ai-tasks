// F-37: render 404 inside the (app) shell so users keep their sidebar/header
// and have a one-click route back to a real page. The previous experience —
// Next.js's default black-background centered 404 — was a dead end with no
// nav and no back link.
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <p className="text-sm font-mono text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          We couldn&apos;t find that page.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been moved, renamed, or deleted. The sidebar still has
          everything else you can reach.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link href="/">
            <Button variant="primary">Back to dashboard</Button>
          </Link>
          <Link href="/tasks">
            <Button variant="outline">Open My Tasks</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
