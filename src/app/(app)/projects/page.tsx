"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Building2,
  ChevronDown,
  FolderOpen,
  MoreHorizontal,
  Trash2,
  Archive,
  PlayCircle,
  Pause,
  Pencil,
  ExternalLink,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { CreateClientDialog } from "@/components/create-client-dialog";
import { CreateProjectDialog } from "@/components/create-project-dialog";

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

type Project = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  status: string | null;
  category: string | null;
  clientId: string | null;
  updatedAt: string;
};

const STATUS_PALETTE: Record<Client["status"], { dot: string; pill: string; label: string }> = {
  active: { dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800", label: "Active" },
  onboarding: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800", label: "Onboarding" },
  paused: { dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800", label: "Paused" },
  archived: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700", label: "Archived" },
};

function money(amount: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function ClientAvatar({ client, size = "md" }: {
  client: Pick<Client, "name" | "logoUrl" | "brandColor">;
  size?: "sm" | "md" | "lg";
}) {
  const dim = { sm: "h-7 w-7 text-[10px]", md: "h-9 w-9 text-sm", lg: "h-12 w-12 text-base" }[size];
  if (client.logoUrl) {
    return <img src={client.logoUrl} alt={client.name} className={cn("rounded-lg object-cover shrink-0 ring-1 ring-gray-200", dim)} />;
  }
  const initials = client.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  return (
    <div
      className={cn("rounded-lg flex items-center justify-center font-bold shrink-0", dim)}
      style={{ background: `linear-gradient(135deg, ${client.brandColor} 0%, ${client.brandColor}99 100%)`, color: "#0d1a00" }}
    >
      {initials}
    </div>
  );
}

// ── Client dropdown combobox ──────────────────────────────────────
function ClientDropdown({
  clients,
  selected,
  onSelect,
}: {
  clients: Client[];
  selected: Client | null;
  onSelect: (client: Client | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : clients;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 h-10 px-3 rounded-xl border text-sm font-medium transition-all min-w-[220px] max-w-xs",
          selected
            ? "bg-white dark:bg-white/8 border-[#99ff33]/50 shadow-[0_0_0_1px_rgb(153_255_51/0.3)]"
            : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20"
        )}
      >
        {selected ? (
          <>
            <ClientAvatar client={selected} size="sm" />
            <span className="flex-1 text-left truncate">{selected.name}</span>
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", STATUS_PALETTE[selected.status].dot)} />
          </>
        ) : (
          <>
            <Building2 size={15} className="text-gray-400 shrink-0" />
            <span className="flex-1 text-left text-gray-500">Select client…</span>
          </>
        )}
        <ChevronDown size={13} className={cn("text-gray-400 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setQuery(""); }} />
          <div className="absolute top-full left-0 mt-1.5 z-50 w-72 bg-white dark:bg-[#1a211a] rounded-xl border border-gray-200 dark:border-white/10 shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100 dark:border-white/8">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search clients…"
                  className="w-full h-7 pl-7 pr-2 text-sm bg-gray-50 dark:bg-white/5 rounded-md outline-none border border-transparent focus:border-[#99ff33]/40"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {/* All clients option */}
              <button
                type="button"
                onClick={() => { onSelect(null); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors",
                  !selected && "bg-gray-50 dark:bg-white/5 font-medium"
                )}
              >
                <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Users size={13} className="text-gray-500" />
                </div>
                <div>
                  <div className="font-medium">All Clients</div>
                  <div className="text-[11px] text-gray-400">{clients.length} client{clients.length !== 1 ? "s" : ""}</div>
                </div>
              </button>

              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-gray-400">No clients found</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onSelect(c); setOpen(false); setQuery(""); }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors",
                      selected?.id === c.id && "bg-[#99ff33]/10 dark:bg-[#99ff33]/10"
                    )}
                  >
                    <ClientAvatar client={c} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_PALETTE[c.status].dot)} />
                        {STATUS_PALETTE[c.status].label}
                        {c.industry && <span>· {c.industry}</span>}
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400 shrink-0">{c._projectCount ?? 0}p</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Project card ─────────────────────────────────────────────────
function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/5 hover:border-[#99ff33]/50 hover:shadow-[0_2px_16px_rgb(153_255_51/0.1)] transition-all overflow-hidden flex flex-col"
    >
      <div className="h-1 shrink-0" style={{ backgroundColor: project.color || "#99ff33" }} />
      <div className="p-4 flex-1">
        <div className="flex items-start gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-base"
            style={{ backgroundColor: project.color + "22" }}
          >
            {project.icon || <FolderOpen size={16} style={{ color: project.color }} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-[#2d5200] dark:group-hover:text-[#99ff33] truncate text-sm leading-tight">
              {project.name}
            </h3>
            {project.category && (
              <p className="text-[11px] text-gray-400 mt-0.5 truncate">{project.category.replace(/_/g, " ")}</p>
            )}
          </div>
          <ExternalLink size={12} className="text-gray-300 dark:text-gray-600 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}

// ── Client overview card (for "All" view) ────────────────────────
function ClientRow({ client, onSelect, onUpdate, onDelete }: {
  client: Client;
  onSelect: (c: Client) => void;
  onUpdate: (id: string, patch: Partial<Client>) => void;
  onDelete: (id: string) => void;
}) {
  const status = STATUS_PALETTE[client.status];
  return (
    <div className="group flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-200 dark:border-white/8 bg-white dark:bg-white/5 hover:border-[#99ff33]/40 hover:shadow-sm transition-all">
      <button type="button" onClick={() => onSelect(client)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <ClientAvatar client={client} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{client.name}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border", status.pill)}>
              <span className={cn("h-1 w-1 rounded-full", status.dot)} />
              {status.label}
            </span>
            {client.industry && <span className="text-[11px] text-gray-400 truncate">{client.industry}</span>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-6 shrink-0 mr-2">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{client._projectCount ?? 0}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Projects</div>
          </div>
          {(client._outstandingBalance ?? 0) > 0 && (
            <div className="text-center">
              <div className="text-sm font-bold text-red-600">{money(client._outstandingBalance ?? 0, client.currency)}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Due</div>
            </div>
          )}
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        <Link
          href={`/projects/client/${client.id}`}
          className="h-7 px-2.5 rounded-md text-xs font-medium border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/8 text-gray-600 dark:text-gray-300 hidden sm:flex items-center"
        >
          Dashboard
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 transition-all">
            <MoreHorizontal size={14} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onSelect(client)}><FolderOpen size={13} className="mr-2" /> View projects</DropdownMenuItem>
            <DropdownMenuItem onClick={() => (window.location.href = `/projects/client/${client.id}`)}><Pencil size={13} className="mr-2" /> Open dashboard</DropdownMenuItem>
            <DropdownMenuSeparator />
            {client.status !== "active" && <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "active" })}><PlayCircle size={13} className="mr-2" /> Mark active</DropdownMenuItem>}
            {client.status !== "paused" && <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "paused" })}><Pause size={13} className="mr-2" /> Pause</DropdownMenuItem>}
            {client.status !== "archived" && <DropdownMenuItem onClick={() => onUpdate(client.id, { status: "archived" })}><Archive size={13} className="mr-2" /> Archive</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(client.id)} className="text-red-600 focus:text-red-600"><Trash2 size={13} className="mr-2" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { success, error } = useToast();

  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newClientOpen, setNewClientOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      setClients(data.clients || []);
    } catch { }
    setLoading(false);
  }, []);

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/projects?limit=200");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch { }
    setProjectsLoading(false);
  }, []);

  useEffect(() => {
    fetchClients();
    fetchProjects();
  }, [fetchClients, fetchProjects]);

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
      description: `"${c?.name}" and all invoices, payments, links will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setClients((prev) => prev.filter((x) => x.id !== id));
    if (selectedClient?.id === id) setSelectedClient(null);
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (res.ok) success({ title: "Client deleted" });
    else { error({ title: "Failed to delete" }); fetchClients(); }
  }

  // Projects for selected client (client-side filter)
  const clientProjects = selectedClient
    ? projects.filter((p) =>
        p.clientId === selectedClient.id ||
        p.category === selectedClient.name
      )
    : [];

  const filteredProjects = search
    ? clientProjects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    : clientProjects;

  const filteredClients = search && !selectedClient
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.industry ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : clients;

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-[#0a0e0a]">
      {/* Header */}
      <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 dark:border-white/8 bg-white dark:bg-[#141814]">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 shrink-0">Projects</h1>

          {/* Client dropdown — primary nav */}
          <ClientDropdown
            clients={clients}
            selected={selectedClient}
            onSelect={(c) => { setSelectedClient(c); setSearch(""); }}
          />

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={selectedClient ? "Search projects…" : "Search clients…"}
              className="h-9 pl-7 text-sm"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {selectedClient && (
              <Button
                size="sm"
                className="btn-brand gap-1.5 h-9"
                onClick={() => setNewProjectOpen(true)}
              >
                <Plus size={14} /> New Project
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9"
              onClick={() => setNewClientOpen(true)}
            >
              <Plus size={14} /> New Client
            </Button>
          </div>
        </div>

        {/* Selected client info strip */}
        {selectedClient && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-white/8">
            <ClientAvatar client={selectedClient} size="sm" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedClient.name}</span>
              <span className={cn("ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium border", STATUS_PALETTE[selectedClient.status].pill)}>
                {STATUS_PALETTE[selectedClient.status].label}
              </span>
              {selectedClient.industry && (
                <span className="ml-2 text-xs text-gray-400">{selectedClient.industry}</span>
              )}
            </div>
            <Link
              href={`/projects/client/${selectedClient.id}`}
              className="text-xs text-[#2d5200] dark:text-[#99ff33] hover:underline shrink-0 flex items-center gap-1"
            >
              Client Dashboard <ExternalLink size={10} />
            </Link>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />)}
          </div>
        ) : selectedClient ? (
          /* ── Client project view ── */
          projectsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100 dark:bg-white/5 animate-pulse" />)}
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-white/8 flex items-center justify-center mb-4">
                <FolderOpen size={24} className="text-gray-400" />
              </div>
              <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                {search ? "No matching projects" : `No projects for ${selectedClient.name}`}
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {search ? "Try a different search" : "Create the first project for this client"}
              </p>
              {!search && (
                <Button size="sm" className="btn-brand gap-1.5" onClick={() => setNewProjectOpen(true)}>
                  <Plus size={14} /> New Project
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProjects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
              {/* Add project tile */}
              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className="rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 hover:border-[#99ff33] hover:bg-[#99ff33]/5 transition-all flex flex-col items-center justify-center gap-1.5 py-6 text-gray-400 hover:text-[#2d5200] dark:hover:text-[#99ff33] group"
              >
                <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-white/8 flex items-center justify-center group-hover:bg-[#99ff33]/20 transition-colors">
                  <Plus size={16} />
                </div>
                <span className="text-xs font-medium">New Project</span>
              </button>
            </div>
          )
        ) : (
          /* ── All clients list ── */
          filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-2xl bg-gray-100 dark:bg-white/8 flex items-center justify-center mb-4">
                <Building2 size={24} className="text-gray-400" />
              </div>
              <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                {clients.length === 0 ? "No clients yet" : "No matches"}
              </p>
              <p className="text-sm text-gray-400 mb-5">
                {clients.length === 0 ? "Add your first client to start managing projects" : "Try adjusting the search"}
              </p>
              {clients.length === 0 && (
                <Button size="sm" className="btn-brand gap-1.5" onClick={() => setNewClientOpen(true)}>
                  <Plus size={14} /> New Client
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl">
              <p className="text-xs text-gray-400 mb-3 uppercase tracking-wider font-semibold">
                {filteredClients.length} client{filteredClients.length !== 1 ? "s" : ""} — select one to view their projects
              </p>
              {filteredClients.map((c) => (
                <ClientRow
                  key={c.id}
                  client={c}
                  onSelect={setSelectedClient}
                  onUpdate={updateClient}
                  onDelete={deleteClient}
                />
              ))}
            </div>
          )
        )}
      </div>

      <CreateProjectDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        defaultClientId={selectedClient?.id}
        onCreated={() => fetchProjects()}
      />
      <CreateClientDialog
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        onCreated={(client) => {
          fetchClients();
          setSelectedClient({ ...client, status: "onboarding", brandColor: "#99ff33", currency: "MYR", logoUrl: null, contactEmail: null, website: null, industry: null });
        }}
      />
    </div>
  );
}
