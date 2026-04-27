"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  FolderOpen,
  Plus,
  DollarSign,
  CheckCircle2,
  ListChecks,
  FileText,
  Receipt,
  Wallet,
  StickyNote,
  Building2,
  AlertCircle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProjectColorDot } from "@/components/icon-color-picker";

// ── Types ─────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  logoUrl: string | null;
  brandColor: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  website: string | null;
  industry: string | null;
  currency: string;
  status: "active" | "onboarding" | "paused" | "archived";
  brief: string | null;
  notes: string | null;
  stats?: {
    projectCount: number;
    totalInvoiced: number;
    totalPaid: number;
    outstandingBalance: number;
    overdueBalance: number;
    totalReceived: number;
  };
  projects?: ProjectLite[];
};

type ProjectLite = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  campaign: string | null;
  updatedAt: string;
};

type Invoice = {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  issuedAt: string | null;
  dueDate: string | null;
};

type Payment = {
  id: string;
  amount: number;
  currency: string;
  paidAt: string;
  notes: string | null;
  invoiceId: string | null;
};

type Tab = "dashboard" | "projects" | "briefing" | "invoices" | "accounting" | "notes";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "dashboard", label: "Dashboard", icon: Building2 },
  { key: "projects", label: "Projects", icon: FolderOpen },
  { key: "briefing", label: "Briefing", icon: FileText },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "accounting", label: "Accounting", icon: Wallet },
  { key: "notes", label: "Notes", icon: StickyNote },
];

const STATUS_PALETTE: Record<string, { dot: string; pill: string; label: string }> = {
  active: { dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800", label: "Active" },
  onboarding: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800", label: "Onboarding" },
  paused: { dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800", label: "Paused" },
  archived: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700", label: "Archived" },
};

const INVOICE_STATUS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  sent: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",
  paid: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
  overdue: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
};

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function ClientAvatar({ client, size = "md" }: { client: Pick<Client, "name" | "logoUrl" | "brandColor">; size?: "sm" | "md" | "lg" }) {
  const dim = { sm: "h-8 w-8 text-xs", md: "h-12 w-12 text-sm", lg: "h-16 w-16 text-lg" }[size];
  if (client.logoUrl) {
    return <img src={client.logoUrl} alt={client.name} className={cn("rounded-xl object-cover shrink-0 bg-white ring-1 ring-gray-200", dim)} />;
  }
  const initials = client.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
  return (
    <div
      className={cn("rounded-xl flex items-center justify-center font-bold shrink-0 shadow-sm", dim)}
      style={{ background: `linear-gradient(135deg, ${client.brandColor} 0%, ${client.brandColor}aa 100%)`, color: "#0d1a00" }}
    >
      {initials}
    </div>
  );
}

// ── Stats box ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/8 p-4">
      <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{label}</p>
      <p className={cn("text-xl font-bold mt-1", accent || "text-gray-800 dark:text-gray-100")}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ client }: { client: Client }) {
  const stats = client.stats;
  const status = STATUS_PALETTE[client.status] ?? STATUS_PALETTE.active;

  return (
    <div className="space-y-6">
      {/* Contact info */}
      <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/8 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">Contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {client.contactName && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Building2 size={14} className="text-gray-400 shrink-0" />
              {client.contactName}
            </div>
          )}
          {client.contactEmail && (
            <a href={`mailto:${client.contactEmail}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#2d5200] dark:hover:text-[#99ff33]">
              <Mail size={14} className="text-gray-400 shrink-0" />
              {client.contactEmail}
            </a>
          )}
          {client.contactPhone && (
            <a href={`tel:${client.contactPhone}`} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#2d5200] dark:hover:text-[#99ff33]">
              <Phone size={14} className="text-gray-400 shrink-0" />
              {client.contactPhone}
            </a>
          )}
          {client.website && (
            <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-[#2d5200] dark:hover:text-[#99ff33]">
              <Globe size={14} className="text-gray-400 shrink-0" />
              <span className="truncate">{client.website.replace(/^https?:\/\//, "")}</span>
              <ExternalLink size={11} className="text-gray-400 shrink-0" />
            </a>
          )}
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Projects" value={String(stats.projectCount)} />
          <StatCard
            label="Outstanding"
            value={money(stats.outstandingBalance, client.currency)}
            accent={stats.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : undefined}
          />
          <StatCard label="Total Invoiced" value={money(stats.totalInvoiced, client.currency)} />
          <StatCard label="Total Paid" value={money(stats.totalPaid, client.currency)} accent="text-green-600 dark:text-green-400" />
        </div>
      )}

      {/* Projects quick list */}
      {(client.projects ?? []).length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Projects</h3>
          <div className="space-y-1.5">
            {(client.projects ?? []).slice(0, 5).map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-gray-100 dark:border-white/8 hover:border-[#99ff33]/40 transition-colors group">
                <ProjectColorDot icon={p.icon} color={p.color} size="sm" />
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-[#2d5200] dark:group-hover:text-[#99ff33] flex-1 truncate font-medium">{p.name}</span>
                {p.campaign && <span className="text-[11px] text-gray-400 hidden sm:inline">{p.campaign}</span>}
                <ExternalLink size={12} className="text-gray-300 group-hover:text-[#99ff33] shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ client }: { client: Client }) {
  const projects = client.projects ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        <Link href={`/projects/new?clientId=${client.id}`}>
          <Button size="sm" className="btn-brand h-8 gap-1.5 text-xs">
            <Plus size={13} /> New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FolderOpen size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No projects yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-gray-100 dark:border-white/8 hover:border-[#99ff33]/40 hover:shadow-sm transition-all group">
              <ProjectColorDot icon={p.icon} color={p.color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 group-hover:text-[#2d5200] dark:group-hover:text-[#99ff33] truncate">{p.name}</p>
                {p.campaign && <p className="text-[11px] text-gray-400 truncate">{p.campaign}</p>}
              </div>
              <ExternalLink size={13} className="text-gray-300 group-hover:text-[#99ff33] shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Briefing Tab ──────────────────────────────────────────────────────────────

function BriefingTab({ client, onSave }: { client: Client; onSave: (brief: string) => void }) {
  const [value, setValue] = useState(client.brief ?? "");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      onSave(v);
      setTimeout(() => setSaving(false), 800);
    }, 1200);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Client brief, brand guidelines, target audience, tone of voice</p>
        {saving && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => { clearTimeout(saveTimer.current); setSaving(true); onSave(value); setTimeout(() => setSaving(false), 500); }}
        placeholder="Who is this client? What do they want? What are their brand guidelines, target audience, tone of voice…"
        className="w-full min-h-[400px] p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#99ff33]/40 resize-none leading-relaxed"
      />
    </div>
  );
}

// ── Invoices Tab ──────────────────────────────────────────────────────────────

function InvoicesTab({ clientId, currency, stats }: {
  clientId: string;
  currency: string;
  stats: Client["stats"];
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/invoices`)
      .then((r) => r.json())
      .then((d) => { setInvoices(d.invoices ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total Invoiced" value={money(stats.totalInvoiced, currency)} />
          <StatCard label="Total Paid" value={money(stats.totalPaid, currency)} accent="text-green-600 dark:text-green-400" />
          <StatCard label="Outstanding" value={money(stats.outstandingBalance, currency)} accent={stats.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : undefined} />
        </div>
      )}

      {loading ? (
        <div className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto text-gray-400" /></div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Receipt size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No invoices yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/8 overflow-hidden">
          {invoices.map((inv) => (
            <div key={inv.id} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 dark:border-white/5 last:border-b-0 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{inv.number || "Invoice"}</p>
                {inv.dueDate && <p className="text-[11px] text-gray-400">Due {new Date(inv.dueDate).toLocaleDateString()}</p>}
              </div>
              <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", INVOICE_STATUS[inv.status] || INVOICE_STATUS.draft)}>
                {inv.status}
              </span>
              <p className="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">
                {money(inv.amount, inv.currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      {stats?.overdueBalance > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle size={14} className="text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            {money(stats.overdueBalance, currency)} overdue — send a payment reminder
          </p>
          <Button size="sm" variant="outline" className="ml-auto h-7 text-xs border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400">
            Send Reminder
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Accounting Tab ────────────────────────────────────────────────────────────

function AccountingTab({ clientId, currency, stats }: {
  clientId: string;
  currency: string;
  stats: Client["stats"];
}) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/payments`)
      .then((r) => r.json())
      .then((d) => { setPayments(d.payments ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Received" value={money(stats.totalReceived, currency)} accent="text-green-600 dark:text-green-400" />
          <StatCard label="Outstanding" value={money(stats.outstandingBalance, currency)} accent={stats.outstandingBalance > 0 ? "text-red-600 dark:text-red-400" : undefined} />
          <StatCard label="Total Invoiced" value={money(stats.totalInvoiced, currency)} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Payment History</h3>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Plus size={12} /> Add Payment
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8"><Loader2 size={20} className="animate-spin mx-auto text-gray-400" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Wallet size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">No payments recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-gray-100 dark:border-white/8 overflow-hidden">
          <div className="grid grid-cols-4 gap-4 px-4 py-2 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/8 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>Date</span>
            <span>Amount</span>
            <span className="hidden sm:block">Invoice</span>
            <span className="hidden sm:block">Notes</span>
          </div>
          {payments.map((p) => (
            <div key={p.id} className="grid grid-cols-4 gap-4 px-4 py-3 border-b border-gray-100 dark:border-white/5 last:border-b-0 text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <span className="text-gray-600 dark:text-gray-400 text-xs">{new Date(p.paidAt).toLocaleDateString()}</span>
              <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{money(p.amount, p.currency)}</span>
              <span className="hidden sm:block text-gray-400 text-xs truncate">{p.invoiceId ? `#${p.invoiceId.slice(-6)}` : "—"}</span>
              <span className="hidden sm:block text-gray-500 text-xs truncate">{p.notes ?? "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notes Tab ─────────────────────────────────────────────────────────────────

function NotesTab({ client, onSave }: { client: Client; onSave: (notes: string) => void }) {
  const [value, setValue] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaving(true);
      onSave(v);
      setTimeout(() => setSaving(false), 600);
    }, 1200);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Meeting notes, general notes, anything informal</p>
        {saving && <span className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Saving…</span>}
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => { clearTimeout(saveTimer.current); setSaving(true); onSave(value); setTimeout(() => setSaving(false), 500); }}
        placeholder="Add meeting notes, call summaries, informal thoughts…"
        className="w-full min-h-[400px] p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#99ff33]/40 resize-none leading-relaxed"
      />
      <p className="text-[11px] text-gray-400">Auto-saves on blur · Changes are saved automatically</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [notFound, setNotFound] = useState(false);

  const fetchClient = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      const data = await res.json();
      setClient(data);
      setLoading(false);
    } catch { setLoading(false); }
  }, [id]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  async function patchClient(patch: Partial<Client>) {
    if (!client) return;
    setClient((prev) => prev ? { ...prev, ...patch } : prev);
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-[#99ff33]" />
      </div>
    );
  }

  if (notFound || !client) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <AlertCircle size={32} className="text-gray-400 mb-3" />
        <p className="text-gray-700 dark:text-gray-300 font-semibold">Client not found</p>
        <Link href="/projects" className="mt-3 text-sm text-[#2d5200] dark:text-[#99ff33] hover:underline flex items-center gap-1">
          <ArrowLeft size={13} /> Back to All Clients
        </Link>
      </div>
    );
  }

  const status = STATUS_PALETTE[client.status] ?? STATUS_PALETTE.active;

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-[#0a0e0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#141814] border-b border-gray-200 dark:border-white/8 px-6 py-4 sticky top-0 z-10">
        <Link href="/projects" className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 transition-colors">
          <ArrowLeft size={12} /> All Clients
        </Link>

        <div className="flex items-start gap-4">
          {/* Avatar */}
          <ClientAvatar client={client} size="lg" />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{client.name}</h1>
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0", status.pill)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap text-[12px] text-gray-500">
              {client.industry && <span>{client.industry}</span>}
              {client.contactEmail && (
                <a href={`mailto:${client.contactEmail}`} className="flex items-center gap-1 hover:text-[#2d5200] dark:hover:text-[#99ff33]">
                  <Mail size={11} />{client.contactEmail}
                </a>
              )}
              {client.contactPhone && (
                <a href={`tel:${client.contactPhone}`} className="flex items-center gap-1 hover:text-[#2d5200] dark:hover:text-[#99ff33]">
                  <Phone size={11} />{client.contactPhone}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-0.5 mt-4 overflow-x-auto scrollbar-none border-b border-gray-100 dark:border-white/8 -mb-4 pb-0">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors shrink-0 border-b-2 -mb-px",
                  tab === t.key
                    ? "border-[#99ff33] text-[#2d5200] dark:text-[#99ff33]"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                )}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-4xl mx-auto">
          {tab === "dashboard" && <DashboardTab client={client} />}
          {tab === "projects" && <ProjectsTab client={client} />}
          {tab === "briefing" && <BriefingTab client={client} onSave={(brief) => patchClient({ brief })} />}
          {tab === "invoices" && <InvoicesTab clientId={client.id} currency={client.currency} stats={client.stats} />}
          {tab === "accounting" && <AccountingTab clientId={client.id} currency={client.currency} stats={client.stats} />}
          {tab === "notes" && <NotesTab client={client} onSave={(notes) => patchClient({ notes })} />}
        </div>
      </div>
    </div>
  );
}
