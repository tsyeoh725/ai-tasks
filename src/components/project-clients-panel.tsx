"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { Building2, Plus, X, Search, ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type LinkedClient = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  status: string;
  services: string;
  _taskCount: number;
};

type AvailableClient = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  status: string;
  industry: string | null;
};

export function ProjectClientsPanel({ projectId }: { projectId: string }) {
  const { success, error } = useToast();
  const [clients, setClients] = useState<LinkedClient[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLinked = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/clients`);
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
  useEffect(() => { fetchLinked(); }, [fetchLinked]);

  async function unlink(clientId: string) {
    // Optimistic
    setClients((prev) => prev.filter((c) => c.id !== clientId));
    const res = await fetch(`/api/projects/${projectId}/clients/${clientId}`, { method: "DELETE" });
    if (!res.ok) { error({ title: "Failed to unlink" }); fetchLinked(); }
    else success({ title: "Client unlinked" });
  }

  async function link(clientId: string) {
    const res = await fetch(`/api/projects/${projectId}/clients`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    if (res.ok) { success({ title: "Client linked" }); fetchLinked(); }
    else error({ title: "Failed to link" });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
          <Building2 size={11} className="text-gray-500" />
          Clients
          {clients.length > 0 && <span className="text-gray-500">({clients.length})</span>}
        </h3>
        <ConnectClientDialog
          projectId={projectId}
          linkedIds={clients.map((c) => c.id)}
          onLinked={(clientId) => link(clientId)}
        />
      </div>

      {loading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => <div key={i} className="h-10 rounded-lg bg-gray-50 animate-pulse" />)}
        </div>
      ) : clients.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-3 text-center">
          No clients linked yet. Connect existing clients or auto-link by tagging tasks with a client.
        </p>
      ) : (
        <div className="space-y-1">
          {clients.map((c) => (
            <div key={c.id} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              {c.logoUrl ? (
                <div className="relative h-7 w-7 rounded-md overflow-hidden ring-1 ring-gray-200 shrink-0">
                  <NextImage
                    src={c.logoUrl}
                    alt={c.name}
                    fill
                    sizes="28px"
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className="h-7 w-7 rounded-md flex items-center justify-center font-bold text-[10px] shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${c.brandColor} 0%, ${c.brandColor}aa 100%)`,
                    color: "#0d1a00",
                  }}
                >
                  {c.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </div>
              )}
              <Link href={`/clients/${c.id}`} className="flex-1 min-w-0 text-sm font-medium text-gray-800 hover:text-[#2d5200] truncate">
                {c.name}
              </Link>
              {c._taskCount > 0 && (
                <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  {c._taskCount} task{c._taskCount !== 1 ? "s" : ""}
                </span>
              )}
              <Link href={`/clients/${c.id}`}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 opacity-0 group-hover:opacity-100 transition-all">
                <ExternalLink size={11} />
              </Link>
              <button
                onClick={() => unlink(c.id)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                title="Unlink"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Connect dialog ───────────────────────────────────────────────────────────

function ConnectClientDialog({
  linkedIds,
  onLinked,
}: {
  projectId: string;
  linkedIds: string[];
  onLinked: (clientId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [available, setAvailable] = useState<AvailableClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setAvailable(data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = available.filter((c) =>
    !linkedIds.includes(c.id) &&
    (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  );

  async function quickCreate() {
    if (!search.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: search.trim() }),
      });
      if (res.ok) {
        const c = await res.json();
        onLinked(c.id);
        setOpen(false);
        setSearch("");
      }
    } finally { setCreating(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <DialogTrigger render={
        <button className="flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium border border-gray-200 bg-white hover:bg-[#99ff33]/10 hover:border-[#99ff33]/40 hover:text-[#2d5200] transition-colors" />
      }>
        <Plus size={10} /> Connect
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect a client to this project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients or type a new name…"
              className="pl-8"
              autoFocus
            />
          </div>

          {loading ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />)}
            </div>
          ) : filtered.length > 0 ? (
            <div className="max-h-72 overflow-y-auto space-y-1">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onLinked(c.id); setOpen(false); }}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[#99ff33]/10 transition-colors text-left group"
                >
                  {c.logoUrl ? (
                    <div className="relative h-8 w-8 rounded-md overflow-hidden ring-1 ring-gray-200 shrink-0">
                      <NextImage
                        src={c.logoUrl}
                        alt=""
                        fill
                        sizes="32px"
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className="h-8 w-8 rounded-md flex items-center justify-center font-bold text-xs shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${c.brandColor} 0%, ${c.brandColor}aa 100%)`,
                        color: "#0d1a00",
                      }}
                    >
                      {c.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    {c.industry && <p className="text-[11px] text-gray-500 truncate">{c.industry}</p>}
                  </div>
                  <Plus size={13} className="text-gray-300 group-hover:text-[#2d5200]" />
                </button>
              ))}
            </div>
          ) : search ? (
            <div className="rounded-lg border-2 border-dashed border-gray-200 p-4 text-center">
              <p className="text-sm text-gray-600 mb-2">
                No client matches &quot;<span className="font-semibold">{search}</span>&quot;
              </p>
              <Button onClick={quickCreate} disabled={creating} className="btn-brand h-8 text-sm gap-1">
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Create &quot;{search.trim()}&quot;
              </Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">
              {available.length === 0 ? "No clients yet — type a name to create one" : "All your clients are already linked"}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
