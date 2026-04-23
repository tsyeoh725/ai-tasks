"use client";

import Link from "next/link";
import { TEAMMATES } from "@/lib/ai-teammates";
import { Button } from "@/components/ui/button";

export default function TeammatesPage() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">AI Teammates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Specialized AI personas with scoped capabilities. Start a focused chat with one.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TEAMMATES.map((t) => (
          <div
            key={t.id}
            className="flex flex-col rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors"
          >
            <div className="text-4xl mb-3" aria-hidden>
              {t.emoji}
            </div>
            <h2 className="font-semibold text-foreground">{t.name}</h2>
            <p className="text-sm text-muted-foreground flex-1 mt-1 mb-4">{t.role}</p>
            <Link href={`/ai?teammate=${t.id}`} className="self-start">
              <Button size="sm">Start chat</Button>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
