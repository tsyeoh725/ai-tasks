"use client";

import { useEffect, useState, useCallback } from "react";
import { Brain, Trash2, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MemoryType = "weekly_summary" | "preference" | "pattern";

type Memory = {
  id: string;
  brand_id: string;
  brand_name?: string;
  memory_type: MemoryType;
  content: string;
  created_at: string;
};

type Brand = { id: string; name: string };

const typeVariant: Record<MemoryType, "default" | "secondary" | "success"> = {
  weekly_summary: "default",
  preference: "secondary",
  pattern: "success",
};

const typeLabel: Record<MemoryType, string> = {
  weekly_summary: "Weekly Summary",
  preference: "Preference",
  pattern: "Pattern",
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [newPreference, setNewPreference] = useState("");
  const [newPrefBrand, setNewPrefBrand] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBrand !== "all") params.set("brandId", selectedBrand);
      const res = await fetch(`/api/agent-memory?${params.toString()}`);
      const data = await res.json();
      const brandsList: Brand[] = Array.isArray(data.brands)
        ? data.brands
        : [];
      setBrands(brandsList);
      const mems = (data.memories || data.items || data) as Record<
        string,
        unknown
      >[];
      const list = Array.isArray(mems) ? mems : [];
      setMemories(
        list.map((m) => ({
          ...(m as unknown as Memory),
          brand_name: (m.brands as { name?: string } | null)?.name,
        })),
      );
    } catch {
      // noop
    }
    setLoading(false);
  }, [selectedBrand]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Ensure brand list is populated even if memory endpoint doesn't return one
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => {
        const list: Brand[] = Array.isArray(data) ? data : data.brands || [];
        setBrands((prev) => (prev.length > 0 ? prev : list));
      })
      .catch(() => {});
  }, []);

  async function addPreference() {
    if (!newPreference.trim() || !newPrefBrand) {
      setStatus("Select a brand and enter a preference");
      return;
    }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/agent-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: newPrefBrand,
          content: newPreference.trim(),
        }),
      });
      if (res.ok) {
        setStatus("Preference added");
        setNewPreference("");
        fetchData();
      } else {
        setStatus("Failed to add preference");
      }
    } catch {
      setStatus("Failed to add preference");
    }
    setSubmitting(false);
  }

  async function deleteMemory(id: string) {
    try {
      await fetch(`/api/agent-memory?id=${id}`, { method: "DELETE" });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setStatus("Failed to delete");
    }
  }

  const weeklySummaries = memories.filter(
    (m) => m.memory_type === "weekly_summary",
  );
  const preferences = memories.filter((m) => m.memory_type === "preference");
  const patterns = memories.filter((m) => m.memory_type === "pattern");

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Agent Memory
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          View and manage the AI&apos;s learned patterns and preferences
        </p>
      </div>

      {status && (
        <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          {status}
        </div>
      )}

      {/* Add Preference */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Preference
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={newPrefBrand}
            onValueChange={(v) => v && setNewPrefBrand(v)}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue>
                {newPrefBrand
                  ? brands.find((b) => b.id === newPrefBrand)?.name || "Brand"
                  : "Select brand..."}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={newPreference}
            onChange={(e) => setNewPreference(e.target.value)}
            placeholder='e.g., "Be more aggressive with CPL during Black Friday week"'
            rows={2}
          />
          <Button
            onClick={addPreference}
            disabled={submitting}
            variant="primary"
            size="sm"
          >
            {submitting ? "Adding..." : "Add Preference"}
          </Button>
        </CardContent>
      </Card>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">
          Brand
        </span>
        <Select
          value={selectedBrand}
          onValueChange={(v) => v && setSelectedBrand(v)}
        >
          <SelectTrigger className="h-8 w-48">
            <SelectValue>
              {selectedBrand === "all"
                ? "All brands"
                : brands.find((b) => b.id === selectedBrand)?.name || "Brand"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-gray-50 border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Brain className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No memories yet</p>
            <p className="text-xs text-gray-400 mt-1">
              The AI will learn from your ad management patterns over time
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {weeklySummaries.length > 0 && (
            <MemorySection
              title="Weekly Summaries"
              memories={weeklySummaries}
              onDelete={deleteMemory}
            />
          )}
          {preferences.length > 0 && (
            <MemorySection
              title="Preferences"
              memories={preferences}
              onDelete={deleteMemory}
            />
          )}
          {patterns.length > 0 && (
            <MemorySection
              title="Patterns"
              memories={patterns}
              onDelete={deleteMemory}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MemorySection({
  title,
  memories,
  onDelete,
}: {
  title: string;
  memories: Memory[];
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
        {title}{" "}
        <span className="text-gray-400">({memories.length})</span>
      </h2>
      <div className="space-y-2">
        {memories.map((memory) => (
          <Card key={memory.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <Badge variant={typeVariant[memory.memory_type]}>
                      {typeLabel[memory.memory_type]}
                    </Badge>
                    {memory.brand_name && (
                      <span className="text-[11px] text-gray-500">
                        {memory.brand_name}
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 font-mono">
                      {formatDistanceToNow(new Date(memory.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 whitespace-pre-wrap">
                    {memory.content}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => onDelete(memory.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
