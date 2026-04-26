"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Building2,
  DollarSign,
  Mail,
  Globe,
  MoreHorizontal,
  Trash2,
  Archive,
  PlayCircle,
  Pause,
  Pencil,
  Calendar,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Client = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  contactEmail: string | null;
  website: string | null;
  industry: string | null;
  status: "active" | "onboarding" | "paused" | "archived";
  currency: string;
  services?: string;
  _projectCount?: number;
  _outstandingBalance?: number;
};

const STATUS_PALETTE: Record<Client["status"], { dot: string; pill: string; label: string }> = {
  active: { dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800", label: "Active" },
  onboarding: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800", label: "Onboarding" },
  paused: { dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800", label: "Paused" },
  archived: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700", label: "Archived" },
};

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function ClientLogo({ client, size = "md" }: {
  client: Pick<Client, "name" | "logoUrl" | "brandColor">;
  size?: "sm" | "md" | "lg";
}) {
  const dim = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" }[size];
  if (client.logoUrl) {
    return (
      <img src={client.logoUrl} alt={client.name}
        className={cn("rounded-lg object-cover shrink-0 bg-white ring-1 ring-gray-200", dim)} />
    );
  }
  const initials = client.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  return (
    <div
      className={cn("rounded-lg flex items-center justify-center font-bold shrink-0 shadow-sm", dim)}
      style={{ background: `linear-gradient(135deg, ${client.brandColor} 0%, ${client.brandColor}aa 100%)`, color: "#0d1a00" }}
    >
      {initials}
    </div>
  );
}

function ClientCard({ client, onUpdate, onDelete }: {
  client: Client;
  onUpdate: (id: string, patch: Partial<Client>) => void;
  onDelete: (id: string) => void;
}) {
  const status = STATUS_PALETTE[client.status];

  return (
    <div className="group relative rounded-2xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/5 hover:border-[#99ff33]/60 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all overflow-hidden">
      <div className="h-1" style={{ backgroundColor: client.brandColor || "#99ff33" }} />

      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <ClientLogo client={client} size="md" />
          <div className="flex-1 min-w-0">
            <Link href={`/projects/client/${client.id}`} className="font-bold text-gray-900 dark:text-gray-100 hover:text-[#2d5200] dark:hover:text-[#99ff33] line-clamp-1 block">
              {client.name}
            </Link>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border", status.pill)}>
                <span className={cn("h-1 w-1 rounded-full", status.dot)} />
                {status.label}
              </span>
              {client.industry && (
                <span className="text-[11px] text-gray-400 truncate">{client.industry}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-gray-700 transition-all">
              <MoreHorizontal size={14} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => (window.location.href = `/projects/client/${client.id}`)}>
                <Pencil size={13} className="mr-2" /> Open
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {client.status !== "active" && (
                <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "active" })}>
                  <PlayCircle size={13} className="mr-2" /> Mark active
                </DropdownMenuItem>
              )}
              {client.status !== "paused" && (
                <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "paused" })}>
                  <Pause size={13} className="mr-2" /> Pause
                </DropdownMenuItem>
              )}
              {client.status !== "archived" && (
                <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "archived" })}>
                  <Archive size={13} className="mr-2" /> Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(client.id)} className="text-red-600 focus:text-red-600">
                <Trash2 size={13} className="mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {(client.contactEmail || client.website) && (
          <div className="flex items-center gap-3 mb-3 text-[11px] text-gray-500 dark:text-gray-400">
            {client.contactEmail && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail size={10} className="shrink-0" />
                <span className="truncate">{client.contactEmail}</span>
              </span>
            )}
            {client.website && (
              <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`}
                target="_blank" rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 truncate hover:text-[#2d5200]">
                <Globe size={10} className="shrink-0" />
                <span className="truncate">{client.website.replace(/^https?:\/\//, "")}</span>
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-white/5">
          <div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              <FolderOpen size={9} /> Projects
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-0.5">{client._projectCount ?? 0}</p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              <DollarSign size={9} /> Outstanding
            </div>
            <p className={cn("text-sm font-bold mt-0.5", (client._outstandingBalance ?? 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400")}>
              {money(client._outstandingBalance ?? 0, client.currency)}
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              <Calendar size={9} /> Deadline
            </div>
            <p className="text-sm font-bold text-gray-400 mt-0.5">—</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewClientDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [brief, setBrief] = useState("");
  const [saving, setSaving] = useState(false);
  const { success } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contactEmail, website, industry, brief }),
      });
      if (res.ok) {
        success({ title: "Client created" });
        onCreated();
        setOpen(false);
        setName(""); setContactEmail(""); setWebsite(""); setIndustry(""); setBrief("");
      }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="btn-brand gap-1.5 h-9 px-4 shadow-none border-0" />}>
        <Plus size={15} /> New Client
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a client</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Corp" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Contact email</Label>
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="hello@acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Website</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="acme.com" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Industry</Label>
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. E-commerce, SaaS, Retail…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Brief</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Quick context, goals, scope…" rows={3} />
          </div>
          <Button type="submit" className="w-full btn-brand" disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create client"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AllClientsPage() {
  const confirm = useConfirm();
  const { success, error } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setClients(data.clients || []);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  async function updateClient(id: string, patch: Partial<Client>) {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { error({ title: "Failed to update" }); fetchClients(); }
    else success({ title: "Updated" });
  }

  async function deleteClient(id: string) {
    const c = clients.find((c) => c.id === id);
    const ok = await confirm({
      title: "Delete client?",
      description: `"${c?.name}" and all invoices, payments, links will be permanently removed. Projects will be unlinked.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setClients((prev) => prev.filter((x) => x.id !== id));
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) success({ title: "Client deleted" });
    else { error({ title: "Failed to delete" }); fetchClients(); }
  }

  const filtered = clients.filter((c) => {
    const matchSearch = !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.industry ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.contactEmail ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalOutstanding = clients.reduce((s, c) => s + (c._outstandingBalance ?? 0), 0);

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in bg-gray-50 dark:bg-[#0a0e0a]">
      <div className="glass-strong sticky top-0 z-10 px-6 py-4 border-b border-gray-200 dark:border-white/8 bg-white dark:bg-[#141814]">
        <div className="flex items-center gap-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">All Clients</h1>
            <p className="text-xs text-gray-500">
              {clients.length} client{clients.length !== 1 ? "s" : ""}
              {totalOutstanding > 0 && (
                <> · <span className="text-red-600 font-semibold">{money(totalOutstanding)} outstanding</span></>
              )}
            </p>
          </div>
          <div className="ml-auto">
            <NewClientDialog onCreated={fetchClients} />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative min-w-0 flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, industry, email…"
              className="h-8 pl-7 text-sm border-gray-200 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { k: "all", label: "All" },
              { k: "active", label: "Active" },
              { k: "onboarding", label: "Onboarding" },
              { k: "paused", label: "Paused" },
              { k: "archived", label: "Archived" },
            ].map((f) => (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-all",
                  statusFilter === f.k
                    ? "bg-[#0d1a00] text-[#99ff33] shadow-[0_0_12px_rgb(153_255_51/0.3)]"
                    : "bg-gray-100 dark:bg-white/8 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/12"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-44 rounded-2xl bg-gray-100 dark:bg-white/5 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-2xl surface-dark-accent flex items-center justify-center mb-4">
              <Building2 size={28} className="text-[#99ff33]" />
            </div>
            <p className="text-gray-700 dark:text-gray-300 font-semibold text-lg mb-1">
              {clients.length === 0 ? "No clients yet" : "No matches"}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {clients.length === 0 ? "Add your first client to start managing projects" : "Try adjusting your search or status filter"}
            </p>
            {clients.length === 0 && <NewClientDialog onCreated={fetchClients} />}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-[1400px] mx-auto">
            {filtered.map((c) => (
              <ClientCard key={c.id} client={c} onUpdate={updateClient} onDelete={deleteClient} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
