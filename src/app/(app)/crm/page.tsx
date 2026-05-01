"use client";

import { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import {
  Plus,
  Search,
  Mail,
  Phone,
  Globe,
  Sparkles,
  Upload,
  Loader2,
  X,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Trash2,
  Zap,
  AlertCircle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type LeadStatus = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | "nurture";
type LeadSource = "inbound" | "outbound" | "referral" | "social" | "website" | "event" | "import" | "manual";

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  website: string | null;
  jobTitle: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  status: LeadStatus;
  estimatedValue: number | null;
  currency: string;
  services: string;
  notes: string | null;
  tags: string;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  convertedClientId: string | null;
  convertedAt: string | null;
  assignedTo?: { id: string; name: string } | null;
  convertedClient?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_PALETTE: Record<LeadStatus, { dot: string; pill: string; label: string }> = {
  new: { dot: "bg-blue-500", pill: "bg-blue-50 text-blue-700 border-blue-200", label: "New" },
  contacted: { dot: "bg-cyan-500", pill: "bg-cyan-50 text-cyan-700 border-cyan-200", label: "Contacted" },
  qualified: { dot: "bg-violet-500", pill: "bg-violet-50 text-violet-700 border-violet-200", label: "Qualified" },
  proposal: { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 border-amber-200", label: "Proposal" },
  negotiation: { dot: "bg-orange-500", pill: "bg-orange-50 text-orange-700 border-orange-200", label: "Negotiation" },
  won: { dot: "bg-green-500", pill: "bg-green-50 text-green-700 border-green-200", label: "Won" },
  lost: { dot: "bg-red-500", pill: "bg-red-50 text-red-700 border-red-200", label: "Lost" },
  nurture: { dot: "bg-gray-400", pill: "bg-gray-100 text-gray-600 border-gray-200", label: "Nurture" },
};

const SOURCE_LABELS: Record<LeadSource, { label: string; icon: string }> = {
  inbound: { label: "Inbound", icon: "📥" },
  outbound: { label: "Outbound", icon: "📤" },
  referral: { label: "Referral", icon: "🤝" },
  social: { label: "Social", icon: "📱" },
  website: { label: "Website", icon: "🌐" },
  event: { label: "Event", icon: "🎪" },
  import: { label: "Import", icon: "📊" },
  manual: { label: "Manual", icon: "✍️" },
};

const PIPELINE: LeadStatus[] = ["new", "contacted", "qualified", "proposal", "negotiation", "won"];

function money(n: number | null, currency = "USD") {
  if (!n) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
}

function relativeTime(iso: string | null) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── New lead dialog ──────────────────────────────────────────────────────────

const LEAD_SERVICES = [
  { value: "social_media", label: "Social Media" },
  { value: "seo", label: "SEO" },
  { value: "paid_ads", label: "Paid Ads" },
  { value: "branding", label: "Branding" },
  { value: "web_design", label: "Web Design" },
  { value: "content", label: "Content" },
  { value: "email_marketing", label: "Email Marketing" },
  { value: "video", label: "Video" },
  { value: "strategy", label: "Strategy" },
  { value: "photography", label: "Photography" },
];

const LEAD_PRIORITY = [
  { value: "hot", label: "🔥 Hot", cls: "bg-red-50 border-red-300 text-red-700" },
  { value: "warm", label: "☀️ Warm", cls: "bg-amber-50 border-amber-300 text-amber-700" },
  { value: "cold", label: "❄️ Cold", cls: "bg-blue-50 border-blue-300 text-blue-700" },
];

function NewLeadDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState<LeadSource>("manual");
  const [bniReferrer, setBniReferrer] = useState("");
  const [priority, setPriority] = useState("warm");
  const [services, setServices] = useState<string[]>([]);
  const [estimatedValue, setEstimatedValue] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { success } = useToast();

  function toggleService(val: string) {
    setServices((prev) => prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]);
  }

  function reset() {
    setName(""); setEmail(""); setCompany(""); setPhone(""); setBniReferrer("");
    setPriority("warm"); setServices([]); setEstimatedValue(""); setNextFollowUpAt(""); setNotes("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const tags = [priority];
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          company: company.trim() || null,
          phone: phone.trim() || null,
          source,
          sourceDetail: source === "referral" && bniReferrer.trim() ? `BNI: ${bniReferrer.trim()}` : null,
          services: JSON.stringify(services),
          tags: JSON.stringify(tags),
          estimatedValue: estimatedValue ? Number(estimatedValue) : null,
          nextFollowUpAt: nextFollowUpAt || null,
          notes: notes.trim() || null,
        }),
      });
      success({ title: "Lead added" });
      onCreated();
      setOpen(false);
      reset();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger render={<Button className="btn-brand gap-1.5 h-9 px-4 shadow-none border-0" />}>
        <Plus size={15} /> New Lead
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add a lead</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3 pb-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Company</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Source</Label>
              <Select value={source} onValueChange={(v) => v && setSource(v as LeadSource)}>
                <SelectTrigger><SelectValue>{SOURCE_LABELS[source].icon} {SOURCE_LABELS[source].label}</SelectValue></SelectTrigger>
                <SelectContent>
                  {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => (
                    <SelectItem key={s} value={s}>{SOURCE_LABELS[s].icon} {SOURCE_LABELS[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Est. value (MYR)</Label>
              <Input type="number" step="500" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} />
            </div>
          </div>

          {/* BNI referrer — only when source = referral */}
          {source === "referral" && (
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">BNI Referrer Name</Label>
              <Input value={bniReferrer} onChange={(e) => setBniReferrer(e.target.value)} placeholder="Who referred this lead?" />
            </div>
          )}

          {/* Priority */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Priority</Label>
            <div className="flex gap-2">
              {LEAD_PRIORITY.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                    priority === p.value
                      ? p.cls + " ring-2 ring-offset-1 ring-current/30"
                      : "border-border text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Service interest */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Service Interest</Label>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_SERVICES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    services.includes(s.value)
                      ? "bg-[#99ff33]/20 border-[#99ff33] text-[#2d5200] dark:text-[#99ff33]"
                      : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/50"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Next follow-up */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Next Follow-up Date</Label>
            <Input type="date" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Where did this lead come from? What are they interested in?" />
          </div>
          <Button type="submit" className="w-full btn-brand" disabled={saving || !name.trim()}>
            {saving ? "Adding…" : "Add lead"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Import CSV dialog ────────────────────────────────────────────────────────

function ImportCsvDialog({ onCompleted }: { onCompleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true); setResult(null); setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/leads/import", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Import failed");
      else { setResult(data); onCompleted(); }
    } catch { setError("Network error"); }
    setUploading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); setError(null); } }}>
      <DialogTrigger render={<Button variant="outline" className="gap-1.5 h-9 px-3" />}>
        <Upload size={13} /> Import CSV
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Import leads from CSV</DialogTitle></DialogHeader>

        {!result && !error && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload a CSV exported from a spreadsheet, form, or another CRM. Columns are auto-detected.
            </p>
            <p className="text-[11px] text-gray-500">
              <span className="font-semibold">Detected columns:</span> Name, Email, Phone, Company, Website, Job Title, Source, Notes, Estimated Value
            </p>
            <label className={cn(
              "block border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
              uploading ? "border-gray-200 bg-gray-50 cursor-wait" : "border-gray-200 hover:border-[#99ff33] hover:bg-[#99ff33]/5"
            )}>
              {uploading
                ? <><Loader2 size={32} className="mx-auto mb-2 text-gray-400 animate-spin" /><p className="text-sm text-gray-500">Processing…</p></>
                : <>
                    <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                    <p className="text-sm font-medium text-gray-800">Drop CSV here or click to browse</p>
                    <p className="text-xs text-gray-500 mt-1">UTF-8 encoded, first row = headers</p>
                  </>}
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={uploading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            </label>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-2">
            <div className="flex items-center gap-2 font-semibold"><AlertCircle size={14} /> {error}</div>
            <Button variant="outline" size="sm" onClick={() => setError(null)}>Try again</Button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Imported</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{result.skipped}</p>
                <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Skipped</p>
              </div>
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{result.total}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total</p>
              </div>
            </div>
            <Button onClick={() => { setOpen(false); setResult(null); }} className="w-full btn-brand">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Connect Spreadsheet dialog ───────────────────────────────────────────────

const CRM_FIELDS = ["name", "email", "phone", "company", "source", "status", "notes"] as const;
type CrmField = (typeof CRM_FIELDS)[number];

const CRM_FIELD_LABELS: Record<CrmField, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  company: "Company",
  source: "Source",
  status: "Status",
  notes: "Notes",
};

function ConnectSpreadsheetDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, CrmField | "">>({});
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"url" | "mapping" | "done">("url");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);
  const { success } = useToast();

  async function loadHeaders() {
    if (!url.trim()) return;
    setLoadingHeaders(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/sheets/headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read sheet");
      const cols: string[] = data.headers ?? [];
      setHeaders(cols);
      // Auto-map by fuzzy name matching
      const auto: Record<string, CrmField | ""> = {};
      cols.forEach((col) => {
        const lc = col.toLowerCase();
        const match = CRM_FIELDS.find((f) => lc.includes(f) || f.includes(lc));
        auto[col] = match ?? "";
      });
      setMapping(auto);
      setStep("mapping");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not read sheet headers");
    }
    setLoadingHeaders(false);
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/sheets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      setLastSync(new Date().toLocaleTimeString());
      success({ title: `Synced ${data.imported ?? 0} leads from spreadsheet` });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
    setSyncing(false);
  }

  async function uploadFileNow(file: File) {
    setSyncing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads/sheets/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploadResult(data);
      success({ title: `Imported ${data.imported ?? 0} leads from file` });
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
    setSyncing(false);
  }

  function reset() {
    setUrl(""); setHeaders([]); setMapping({}); setError(null); setStep("url"); setLastSync(null);
    setUploadFile(null); setUploadResult(null); setMode("url");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button variant="outline" className="gap-1.5 h-9 px-3" />}>
        <Globe size={13} /> Connect Spreadsheet
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from Spreadsheet</DialogTitle>
        </DialogHeader>

        {step !== "done" && (
          <div className="flex rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => { setMode("url"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "url" ? "bg-[#99ff33] text-black" : "hover:bg-muted text-muted-foreground"}`}
            >
              Google Sheets URL
            </button>
            <button
              type="button"
              onClick={() => { setMode("file"); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === "file" ? "bg-[#99ff33] text-black" : "hover:bg-muted text-muted-foreground"}`}
            >
              Upload File (.xlsx / .csv)
            </button>
          </div>
        )}

        {step === "url" && mode === "url" && (
          <div className="space-y-4">
            <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
              The sheet must be shared as <strong>Anyone with the link can view</strong>. In Google Sheets: Share → Change to Anyone with the link → Viewer.
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Google Sheets URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                autoFocus
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <Button
              onClick={loadHeaders}
              disabled={!url.trim() || loadingHeaders}
              className="w-full btn-brand"
            >
              {loadingHeaders ? <><Loader2 size={14} className="animate-spin mr-2" /> Reading sheet…</> : "Read Sheet Headers"}
            </Button>
          </div>
        )}

        {step === "url" && mode === "file" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Upload an Excel (.xlsx) or CSV file. Columns will be auto-detected from the header row.
            </p>
            <label
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-all ${
                uploadFile ? "border-[#99ff33] bg-[#99ff33]/5" : "border-gray-200 dark:border-white/10 hover:border-[#99ff33] hover:bg-[#99ff33]/5"
              }`}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); setError(null); }}
              />
              <Upload size={20} className={uploadFile ? "text-[#2d5200]" : "text-gray-400"} />
              {uploadFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{uploadFile.name}</p>
                  <p className="text-xs text-gray-400">{(uploadFile.size / 1024).toFixed(0)} KB · click to change</p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Drop file here or click to browse</p>
                  <p className="text-xs text-gray-400">.xlsx, .xls, .csv supported</p>
                </div>
              )}
            </label>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <Button
              onClick={() => uploadFile && uploadFileNow(uploadFile)}
              disabled={!uploadFile || syncing}
              className="w-full btn-brand"
            >
              {syncing ? <><Loader2 size={14} className="animate-spin mr-2" /> Importing…</> : "Import Leads"}
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">Map your sheet columns to CRM fields. Unmapped columns will be ignored.</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {headers.map((col) => (
                <div key={col} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 dark:text-gray-300 w-32 truncate shrink-0">{col}</span>
                  <span className="text-gray-400 text-xs">→</span>
                  <Select
                    value={mapping[col] || "__skip__"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [col]: v === "__skip__" ? "" : v as CrmField }))}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__skip__">— Skip —</SelectItem>
                      {CRM_FIELDS.map((f) => (
                        <SelectItem key={f} value={f}>{CRM_FIELD_LABELS[f]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Auto-sync toggle (disabled) */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-sync</p>
                <p className="text-[11px] text-gray-400">Automatically pull new rows</p>
              </div>
              <div className="relative group/tip">
                <button
                  disabled
                  className="relative h-5 w-9 rounded-full bg-gray-200 dark:bg-gray-700 cursor-not-allowed opacity-60"
                >
                  <span className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform" />
                </button>
                <div className="absolute -top-8 right-0 hidden group-hover/tip:block bg-gray-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                  Coming soon
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("url")} className="flex-1">Back</Button>
              <Button onClick={syncNow} disabled={syncing} className="flex-1 btn-brand">
                {syncing ? <><Loader2 size={14} className="animate-spin mr-2" /> Syncing…</> : "Sync Now"}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center py-4">
            <div className="h-12 w-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center mx-auto">
              <CheckCircle2 size={24} className="text-green-500" />
            </div>
            <p className="font-semibold text-gray-800 dark:text-gray-200">Import complete</p>
            {(uploadResult || lastSync) && (
              <p className="text-sm text-gray-400">
                {uploadResult
                  ? `${uploadResult.imported} imported, ${uploadResult.skipped} skipped of ${uploadResult.total} rows`
                  : `Last synced at ${lastSync}`}
              </p>
            )}
            <Button onClick={() => setOpen(false)} className="w-full btn-brand">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────

function LeadRow({ lead, onUpdate, onDelete, onConvert }: {
  lead: Lead;
  onUpdate: (id: string, patch: Partial<Lead>) => void;
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
}) {
  const status = STATUS_PALETTE[lead.status];
  const sourceMeta = SOURCE_LABELS[lead.source];

  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
        {lead.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"}
      </div>

      {/* Identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900 truncate">{lead.name}</p>
          {lead.company && <span className="text-xs text-gray-500 truncate">· {lead.company}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
          {lead.email && <span className="flex items-center gap-1 truncate"><Mail size={9} />{lead.email}</span>}
          {lead.phone && <span className="flex items-center gap-1"><Phone size={9} />{lead.phone}</span>}
          <span className="flex items-center gap-0.5 text-gray-400 truncate">
            {sourceMeta.icon} {sourceMeta.label}
          </span>
        </div>
      </div>

      {/* Value */}
      <div className="text-right hidden sm:block">
        <p className="text-sm font-semibold text-gray-800 tabular-nums">{money(lead.estimatedValue, lead.currency)}</p>
        <p className="text-[11px] text-gray-400">{relativeTime(lead.updatedAt)}</p>
      </div>

      {/* Status select */}
      <Select value={lead.status} onValueChange={(v) => v && onUpdate(lead.id, { status: v as LeadStatus })}>
        <SelectTrigger className="h-7 w-32 text-xs border-gray-200 shrink-0">
          <SelectValue>
            <span className={cn("inline-flex items-center gap-1.5", status.pill, "px-2 py-0 rounded-full text-[10px] font-medium border")}>
              <span className={cn("h-1 w-1 rounded-full", status.dot)} />
              {status.label}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_PALETTE) as LeadStatus[]).map((s) => (
            <SelectItem key={s} value={s}>
              <span className="flex items-center gap-2">
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_PALETTE[s].dot)} />
                {STATUS_PALETTE[s].label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Actions */}
      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity shrink-0">
        {lead.convertedClientId ? (
          <a href={`/clients/${lead.convertedClientId}`}
            className="text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 font-medium hover:bg-green-100">
            ✓ Client
          </a>
        ) : (lead.status === "won" || lead.status === "qualified") ? (
          <button onClick={() => onConvert(lead.id)}
            className="text-[10px] text-[#2d5200] bg-[#99ff33]/15 border border-[#99ff33]/40 rounded-full px-2 py-0.5 font-semibold hover:bg-[#99ff33]/25 flex items-center gap-1">
            <Sparkles size={9} /> Convert
          </button>
        ) : null}
        <button onClick={() => onDelete(lead.id)}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ─── Pipeline column (Kanban) ─────────────────────────────────────────────────

function PipelineColumn({
  status,
  leads,
  onDelete,
  onConvert,
}: {
  status: LeadStatus;
  leads: Lead[];
  onDelete: (id: string) => void;
  onConvert: (id: string) => void;
}) {
  const meta = STATUS_PALETTE[status];
  const total = leads.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);

  return (
    <div className="flex flex-col rounded-xl bg-gray-50/60 border border-gray-200 min-h-[20rem] w-72 shrink-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className="text-xs font-bold text-gray-800">{meta.label}</span>
        <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded-full">{leads.length}</span>
        {total > 0 && (
          <span className="ml-auto text-[10px] text-gray-500 font-mono tabular-nums">
            {money(total)}
          </span>
        )}
      </div>
      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "p-2 space-y-2 overflow-y-auto flex-1 transition-colors",
              snapshot.isDraggingOver && "bg-[#99ff33]/10",
            )}
          >
            {leads.length === 0 && !snapshot.isDraggingOver ? (
              <p className="text-[11px] text-gray-400 text-center py-6 italic">No leads</p>
            ) : leads.map((l, index) => (
              <Draggable key={l.id} draggableId={l.id} index={index}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={cn(
                      "group rounded-lg bg-white border border-gray-200 p-2.5 transition-all cursor-grab active:cursor-grabbing",
                      "hover:border-[#99ff33]/60 hover:shadow-sm",
                      dragSnapshot.isDragging && "shadow-lg ring-2 ring-[#99ff33]/40 rotate-1 cursor-grabbing border-[#99ff33]"
                    )}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate flex-1">{l.name}</p>
                      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(l.id); }}
                        className="h-5 w-5 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <X size={10} />
                      </button>
                    </div>
                    {l.company && <p className="text-[11px] text-gray-500 truncate mb-1">{l.company}</p>}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">
                        {SOURCE_LABELS[l.source].icon} {SOURCE_LABELS[l.source].label}
                      </span>
                      {l.estimatedValue && (
                        <span className="text-[11px] font-semibold text-gray-700 tabular-nums">
                          {money(l.estimatedValue, l.currency)}
                        </span>
                      )}
                    </div>
                    {(l.status === "won" || l.status === "qualified") && !l.convertedClientId && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); onConvert(l.id); }}
                        className="w-full mt-1.5 text-[10px] text-[#2d5200] bg-[#99ff33]/15 border border-[#99ff33]/40 rounded-md px-2 py-1 font-semibold hover:bg-[#99ff33]/25 flex items-center justify-center gap-1">
                        <Sparkles size={9} /> Convert to Client
                      </button>
                    )}
                    {l.convertedClient && (
                      <a href={`/clients/${l.convertedClient.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block mt-1.5 text-[10px] text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1 font-medium hover:bg-green-100 text-center">
                        ✓ {l.convertedClient.name}
                      </a>
                    )}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CrmPage() {
  const confirm = useConfirm();
  const { success, error } = useToast();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setLeads(data.leads || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount; not migrating to Suspense
    fetchLeads();
  }, [fetchLeads]);

  async function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { error({ title: "Update failed" }); fetchLeads(); }
  }

  async function deleteLead(id: string) {
    const lead = leads.find((l) => l.id === id);
    const ok = await confirm({
      title: "Delete lead?",
      description: `"${lead?.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    if (res.ok) success({ title: "Lead deleted" });
    else { error({ title: "Failed to delete" }); fetchLeads(); }
  }

  async function convertLead(id: string) {
    const res = await fetch(`/api/leads/${id}/convert`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      success({ title: "Lead converted to client", description: "View in Clients tab" });
      // Optimistic refresh
      fetchLeads();
      if (data.clientId) window.location.href = `/clients/${data.clientId}`;
    } else error({ title: "Conversion failed" });
  }

  const filtered = leads.filter((l) => {
    const s = search.toLowerCase();
    const matchSearch = !s ||
      l.name.toLowerCase().includes(s) ||
      (l.email ?? "").toLowerCase().includes(s) ||
      (l.company ?? "").toLowerCase().includes(s);
    const matchSource = sourceFilter === "all" || l.source === sourceFilter;
    return matchSearch && matchSource;
  });

  // Pipeline groups
  const byStatus = new Map<LeadStatus, Lead[]>();
  PIPELINE.forEach((s) => byStatus.set(s, []));
  for (const l of filtered) {
    if (PIPELINE.includes(l.status)) {
      byStatus.get(l.status)!.push(l);
    }
  }

  const stats = {
    total: leads.length,
    new: leads.filter((l) => l.status === "new").length,
    qualified: leads.filter((l) => l.status === "qualified" || l.status === "proposal" || l.status === "negotiation").length,
    won: leads.filter((l) => l.status === "won").length,
    pipelineValue: filtered
      .filter((l) => PIPELINE.includes(l.status) && l.status !== "won")
      .reduce((s, l) => s + (l.estimatedValue ?? 0), 0),
  };

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in">
      {/* ── Sticky header ── */}
      <div className="glass-strong sticky top-0 z-10 px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap size={18} className="text-[#2d5200]" />
              CRM
            </h1>
            <p className="text-xs text-gray-500">
              {stats.total} leads · {stats.qualified} in pipeline · <span className="font-semibold text-[#2d5200]">{money(stats.pipelineValue)} pipeline value</span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ConnectSpreadsheetDialog />
            <ImportCsvDialog onCompleted={fetchLeads} />
            <NewLeadDialog onCreated={fetchLeads} />
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <StatBox label="Total" value={stats.total} accent="text-gray-700" icon={Sparkles} />
          <StatBox label="New" value={stats.new} accent="text-blue-700" icon={TrendingUp} />
          <StatBox label="In Pipeline" value={stats.qualified} accent="text-amber-700" icon={ArrowRight} />
          <StatBox label="Won" value={stats.won} accent="text-green-700" icon={CheckCircle2} />
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-0 flex-1 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search leads…"
              className="h-8 pl-7 text-sm border-gray-200"
            />
          </div>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 bg-white">
            <button
              onClick={() => setView("pipeline")}
              className={cn(
                "px-2.5 h-6 flex items-center text-xs font-medium rounded-md transition-colors",
                view === "pipeline" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"
              )}
            >
              Pipeline
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "px-2.5 h-6 flex items-center text-xs font-medium rounded-md transition-colors",
                view === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-700"
              )}
            >
              List
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setSourceFilter("all")}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                sourceFilter === "all" ? "bg-[#0d1a00] text-[#99ff33]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              All
            </button>
            {(Object.keys(SOURCE_LABELS) as LeadSource[]).map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                  sourceFilter === s ? "bg-[#0d1a00] text-[#99ff33]" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {SOURCE_LABELS[s].icon} {SOURCE_LABELS[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-72 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-16 w-16 rounded-2xl surface-dark-accent flex items-center justify-center mb-4">
              <Zap size={28} className="text-[#99ff33]" />
            </div>
            <p className="text-gray-700 font-semibold text-lg mb-1">
              {leads.length === 0 ? "No leads yet" : "No matches"}
            </p>
            <p className="text-gray-400 text-sm mb-6">
              {leads.length === 0
                ? "Add your first lead manually or import from a spreadsheet"
                : "Try adjusting your search or filter"}
            </p>
            {leads.length === 0 && (
              <div className="flex gap-2">
                <ImportCsvDialog onCompleted={fetchLeads} />
                <NewLeadDialog onCreated={fetchLeads} />
              </div>
            )}
          </div>
        ) : view === "pipeline" ? (
          <DragDropContext
            onDragEnd={(result: DropResult) => {
              if (!result.destination) return;
              const newStatus = result.destination.droppableId as LeadStatus;
              const oldStatus = result.source.droppableId as LeadStatus;
              if (newStatus === oldStatus) return;
              updateLead(result.draggableId, { status: newStatus });
            }}
          >
            <div className="flex gap-3 overflow-x-auto pb-4">
              {PIPELINE.map((s) => (
                <PipelineColumn
                  key={s}
                  status={s}
                  leads={byStatus.get(s) ?? []}
                  onDelete={deleteLead}
                  onConvert={convertLead}
                />
              ))}
              {/* Lost / nurture as droppable mini-columns */}
              <div className="flex flex-col gap-2 w-72 shrink-0">
                {(["lost", "nurture"] as LeadStatus[]).map((s) => {
                  const list = filtered.filter((l) => l.status === s);
                  return (
                    <Droppable key={s} droppableId={s}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "rounded-xl border border-gray-200 px-3 py-2 transition-colors",
                            snapshot.isDraggingOver ? "bg-[#99ff33]/10 border-[#99ff33]" : "bg-gray-50/60"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                              <span className={cn("h-2 w-2 rounded-full", STATUS_PALETTE[s].dot)} />
                              {STATUS_PALETTE[s].label}
                            </span>
                            <span className="text-[10px] text-gray-500 bg-white px-1.5 py-0.5 rounded-full">{list.length}</span>
                          </div>
                          {snapshot.isDraggingOver && (
                            <p className="text-[10px] text-[#2d5200] mt-1.5 italic">Drop to mark as {STATUS_PALETTE[s].label}</p>
                          )}
                          <div className="hidden">{provided.placeholder}</div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </div>
          </DragDropContext>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filtered.map((l) => (
              <LeadRow key={l.id} lead={l} onUpdate={updateLead} onDelete={deleteLead} onConvert={convertLead} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatBox({ label, value, accent, icon: Icon }: {
  label: string;
  value: number;
  accent: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={10} className={accent} />
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      </div>
      <p className={cn("text-lg font-bold leading-none tabular-nums", accent)}>{value}</p>
    </div>
  );
}
