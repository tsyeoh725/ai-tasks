"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Mail,
  Phone,
  Globe,
  FileText,
  Receipt,
  Wallet,
  Link2,
  Settings,
  Upload,
  Plus,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertCircle,
  DollarSign,
  FolderOpen,
  Building2,
  ListChecks,
  Loader2,
  Pencil,
  HardDrive,
  RefreshCw,
  Image as ImageIcon,
  FileSpreadsheet,
  Presentation,
  FileVideo,
  FileAudio,
  File as FileGeneric,
  FolderPlus,
  ClipboardPaste,
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
import { StatusPill, PriorityPill } from "@/components/task-chips";
import { ProjectColorDot } from "@/components/icon-color-picker";
import { SERVICE_CATEGORIES } from "@/app/(app)/clients/page";

function parseServices(s: string | undefined): string[] {
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }
  catch { return []; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Client = {
  id: string;
  name: string;
  logoUrl: string | null;
  brief: string | null;
  brandColor: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  website: string | null;
  industry: string | null;
  billingAddress: string | null;
  taxId: string | null;
  currency: string;
  status: "active" | "onboarding" | "paused" | "archived";
  services: string;     // JSON array
  customFields: string;
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

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  iconLink?: string;
};

type Invoice = {
  id: string;
  number: string;
  title: string | null;
  amount: number;
  currency: string;
  status: "draft" | "sent" | "paid" | "overdue" | "void";
  issuedDate: string | null;
  dueDate: string | null;
  paidDate: string | null;
  notes: string | null;
};

type Payment = {
  id: string;
  invoiceId: string | null;
  amount: number;
  currency: string;
  paymentDate: string;
  reference: string | null;
  source: string;
  rawDescription: string | null;
  matched: boolean;
  notes: string | null;
  invoice?: { id: string; number: string; amount: number } | null;
};

type ClientLink = {
  id: string;
  platform: string;
  label: string;
  url: string;
  sortOrder: number;
};

type TaskLite = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project?: { name: string; color: string } | null;
};

type Tab = "overview" | "projects" | "invoices" | "payments" | "tasks" | "links" | "settings";

function money(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

const STATUS_PALETTE: Record<Client["status"], { pill: string; dot: string; label: string }> = {
  active: { pill: "bg-green-50 text-green-700 border-green-200", dot: "bg-green-500", label: "Active" },
  onboarding: { pill: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500", label: "Onboarding" },
  paused: { pill: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400", label: "Paused" },
  archived: { pill: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400", label: "Archived" },
};

const INVOICE_STATUS: Record<Invoice["status"], { pill: string; label: string }> = {
  draft: { pill: "bg-gray-100 text-gray-700 border-gray-200", label: "Draft" },
  sent: { pill: "bg-blue-50 text-blue-700 border-blue-200", label: "Sent" },
  paid: { pill: "bg-green-50 text-green-700 border-green-200", label: "Paid" },
  overdue: { pill: "bg-red-50 text-red-700 border-red-200", label: "Overdue" },
  void: { pill: "bg-gray-100 text-gray-500 border-gray-200 line-through", label: "Void" },
};

// ─── Inline editable text ─────────────────────────────────────────────────────

function EditableText({
  value,
  placeholder,
  onSave,
  multiline = false,
  className,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => Promise<void>;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(value), [value]);

  async function save() {
    if (draft === value) return setEditing(false);
    setSaving(true);
    try { await onSave(draft); setEditing(false); } finally { setSaving(false); }
  }

  if (editing) {
    if (multiline) {
      return (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          autoFocus
          rows={4}
          className={cn("border-[#99ff33]/50 focus:border-[#99ff33] focus:ring-[#99ff33]/30", className)}
          disabled={saving}
        />
      );
    }
    return (
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        autoFocus
        className={cn("border-[#99ff33]/50 focus:border-[#99ff33] focus:ring-[#99ff33]/30", className)}
        disabled={saving}
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "group/e flex items-center gap-1 text-left hover:bg-gray-50 rounded px-1.5 py-0.5 -mx-1.5 w-full min-w-0",
        !value && "text-gray-400 italic",
        className,
      )}
    >
      <span className={cn("truncate", multiline && "whitespace-pre-wrap")}>{value || placeholder || "—"}</span>
      <Pencil size={11} className="text-gray-300 opacity-0 group-hover/e:opacity-100 shrink-0 ml-auto transition-opacity" />
    </button>
  );
}

// ─── Logo with upload ─────────────────────────────────────────────────────────

function LogoWithUpload({ client, onUpdate }: { client: Client; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const { error, success } = useToast();

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      error({ title: "Images only" });
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/clients/${client.id}/logo`, { method: "POST", body: form });
    if (res.ok) { onUpdate(); success({ title: "Logo updated" }); }
    else error({ title: "Upload failed" });
    setUploading(false);
  }

  // Global paste listener — Ctrl+V anywhere on the page pastes an image as logo
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        setPasteHint(true);
        upload(file).finally(() => setPasteHint(false));
      }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  return (
    <div className="flex flex-col items-center gap-1.5 shrink-0">
      <label className="relative group cursor-pointer">
        {client.logoUrl ? (
          <div className="relative h-20 w-20 rounded-2xl overflow-hidden ring-1 ring-gray-200 bg-white">
            <NextImage
              src={client.logoUrl}
              alt={client.name}
              fill
              sizes="80px"
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div
            className="h-20 w-20 rounded-2xl flex items-center justify-center font-bold text-2xl shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${client.brandColor} 0%, ${client.brandColor}aa 100%)`,
              color: "#0d1a00",
            }}
          >
            {client.name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
          </div>
        )}
        <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          {uploading ? <Loader2 size={20} className="animate-spin text-white" /> : <Camera size={18} className="text-white" />}
        </div>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
        />
      </label>
      <span className={cn(
        "text-[10px] transition-colors flex items-center gap-0.5",
        pasteHint ? "text-[#99ff33]" : "text-gray-400",
      )}>
        <ClipboardPaste size={9} />
        {pasteHint ? "Pasting…" : "Ctrl+V to paste"}
      </span>
    </div>
  );
}

// ─── New invoice dialog ───────────────────────────────────────────────────────

// ─── Client Drive Panel ───────────────────────────────────────────────────────

function driveFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <ImageIcon size={16} className="text-purple-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet size={16} className="text-green-600" />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return <Presentation size={16} className="text-orange-500" />;
  if (mimeType.includes("pdf")) return <FileText size={16} className="text-red-500" />;
  if (mimeType.startsWith("video/")) return <FileVideo size={16} className="text-blue-500" />;
  if (mimeType.startsWith("audio/")) return <FileAudio size={16} className="text-pink-500" />;
  if (mimeType.includes("folder")) return <FolderOpen size={16} className="text-yellow-500" />;
  return <FileGeneric size={16} className="text-gray-500" />;
}

function formatBytes(bytes: string | undefined): string {
  if (!bytes) return "";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ClientDrivePanel({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, setState] = useState<"loading" | "unlinked" | "no_google" | "ready">("loading");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { error, success } = useToast();

  const fetchFiles = useCallback(async (quiet = false) => {
    if (!quiet) setState("loading");
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drive`);
      const data = await res.json();
      if (data.error === "Google account not linked") { setState("no_google"); return; }
      if (!data.linked) { setState("unlinked"); return; }
      setFolderId(data.folderId);
      setFolderName(data.folderName ?? "Client Files");
      setFiles(data.files ?? []);
      setState("ready");
    } catch {
      setState("unlinked");
    } finally {
      setRefreshing(false);
    }
  }, [clientId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  async function createDriveFolder() {
    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create: true }),
      });
      const data = await res.json();
      if (data.error) { error({ title: data.error }); return; }
      success({ title: `Folder "${data.folderName}" created in Drive` });
      await fetchFiles();
    } catch {
      error({ title: "Failed to create folder" });
    } finally {
      setCreating(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="rounded-xl border border-gray-200 p-4 animate-pulse space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-gray-200" />
          <div className="h-4 w-32 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (state === "no_google") {
    return (
      <div className="rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-5 text-center">
        <HardDrive size={28} className="mx-auto text-blue-400 mb-2" />
        <p className="text-sm font-medium text-blue-900">Google Drive not connected</p>
        <p className="text-xs text-blue-600 mt-1">Connect your Google account in Settings to link Drive files.</p>
      </div>
    );
  }

  if (state === "unlinked") {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <FolderPlus size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-700">No Drive folder linked yet</p>
        <p className="text-xs text-gray-500 mt-1 mb-4">
          Create a dedicated folder in your Google Drive for all {clientName} files.
        </p>
        <Button size="sm" onClick={createDriveFolder} disabled={creating} className="gap-1.5">
          {creating ? <Loader2 size={13} className="animate-spin" /> : <HardDrive size={13} />}
          {creating ? "Creating…" : "Create Drive Folder"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <HardDrive size={15} className="text-[#4285f4]" />
          <span className="text-sm font-semibold text-gray-800">{folderName ?? "Client Files"}</span>
          <span className="text-xs text-gray-400">({files.length} file{files.length !== 1 ? "s" : ""})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchFiles(true)}
            disabled={refreshing}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={13} className={cn(refreshing && "animate-spin")} />
          </button>
          {folderId && (
            <a
              href={`https://drive.google.com/drive/folders/${folderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-[#4285f4] text-white hover:bg-[#3367d6] transition-colors font-medium"
            >
              <Upload size={11} />
              Upload / Open
            </a>
          )}
        </div>
      </div>

      {/* File grid */}
      {files.length === 0 ? (
        <div className="py-10 text-center">
          <FolderOpen size={32} className="mx-auto text-gray-200 mb-2" />
          <p className="text-sm text-gray-500">No files yet</p>
          <p className="text-xs text-gray-400 mt-1">Open the folder in Drive to upload files</p>
        </div>
      ) : (
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {files.map((file) => (
            <a
              key={file.id}
              href={file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 p-3 rounded-lg border border-gray-100 hover:border-[#99ff33]/50 hover:bg-gray-50/80 transition-all group"
            >
              <div className="mt-0.5 shrink-0">
                {file.thumbnailLink ? (
                  <div className="relative h-8 w-8 rounded overflow-hidden">
                    <NextImage
                      src={file.thumbnailLink}
                      alt=""
                      fill
                      sizes="32px"
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                ) : (
                  driveFileIcon(file.mimeType)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate group-hover:text-gray-900">{file.name}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                  {formatBytes(file.size)}
                  {file.modifiedTime && (
                    <>
                      {file.size && " · "}
                      {new Date(file.modifiedTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </>
                  )}
                </p>
              </div>
              <ExternalLink size={11} className="text-gray-300 group-hover:text-gray-500 shrink-0 mt-0.5 transition-colors" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function NewInvoiceDialog({ clientId, currency, onCreated }: { clientId: string; currency: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [status, setStatus] = useState<Invoice["status"]>("sent");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { success } = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/invoices`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(amount), title, dueDate, status, notes, issuedDate: new Date().toISOString() }),
      });
      if (res.ok) {
        success({ title: "Invoice created" });
        onCreated();
        setOpen(false); setAmount(""); setTitle(""); setNotes("");
      }
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="btn-brand gap-1.5 h-8 px-3 shadow-none border-0 text-sm" />}>
        <Plus size={13} /> New Invoice
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create invoice</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October retainer" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Amount *</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-mono">{currency}</span>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="pl-10" required autoFocus />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Status</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as Invoice["status"])}>
              <SelectTrigger><SelectValue>{INVOICE_STATUS[status].label}</SelectValue></SelectTrigger>
              <SelectContent>
                {(Object.keys(INVOICE_STATUS) as Invoice["status"][]).map((s) => (
                  <SelectItem key={s} value={s}>{INVOICE_STATUS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="w-full btn-brand" disabled={saving || !amount}>
            {saving ? "Creating…" : "Create invoice"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── New payment dialog ───────────────────────────────────────────────────────

function NewPaymentDialog({ clientId, invoices, onCreated }: { clientId: string; invoices: Invoice[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [invoiceId, setInvoiceId] = useState<string>("none");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const unpaidInvoices = invoices.filter((i) => i.status !== "paid" && i.status !== "void");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          invoiceId: invoiceId === "none" ? null : invoiceId,
          paymentDate,
          reference,
          source: "manual",
        }),
      });
      onCreated();
      setOpen(false); setAmount(""); setInvoiceId("none"); setReference("");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-1.5 h-8 px-3 text-sm" />}>
        <Plus size={13} /> Record Payment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Amount *</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Link to invoice</Label>
            <Select value={invoiceId} onValueChange={(v) => v && setInvoiceId(v)}>
              <SelectTrigger>
                <SelectValue>
                  {invoiceId === "none"
                    ? "No invoice (standalone)"
                    : invoices.find((i) => i.id === invoiceId)?.number ?? "—"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No invoice (standalone)</SelectItem>
                {unpaidInvoices.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.number} — {money(i.amount, i.currency)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank ref, transaction ID…" />
          </div>
          <Button type="submit" className="w-full btn-brand" disabled={saving || !amount}>
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bank statement import dialog ─────────────────────────────────────────────

function ImportBankDialog({ clientId, onCompleted }: { clientId: string; onCompleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; matched: number; unmatched: number; missingPayments?: Array<{ number: string; amount: number; dueDate: string | null }> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true); setResult(null); setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/clients/${clientId}/payments/import`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
      } else {
        setResult(data);
        onCompleted();
      }
    } catch { setError("Network error"); }
    setUploading(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setResult(null); setError(null); } }}>
      <DialogTrigger render={<Button variant="outline" className="gap-1.5 h-8 px-3 text-sm" />}>
        <Upload size={13} /> Import Bank CSV
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Import bank statement</DialogTitle></DialogHeader>

        {!result && !error && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload a CSV exported from your bank. Payments are auto-matched to invoices by amount and
              invoice number appearing in the description.
            </p>
            <label className={cn(
              "block border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
              uploading
                ? "border-gray-200 bg-gray-50 cursor-wait"
                : "border-gray-200 hover:border-[#99ff33] hover:bg-[#99ff33]/5"
            )}>
              {uploading ? (
                <><Loader2 size={32} className="mx-auto mb-2 text-gray-400 animate-spin" /><p className="text-sm text-gray-500">Processing…</p></>
              ) : (
                <>
                  <Upload size={32} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-sm font-medium text-gray-800">Drop CSV here or click to browse</p>
                  <p className="text-xs text-gray-500 mt-1">Expected columns: Date, Amount, Description</p>
                </>
              )}
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
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-center">
                <p className="text-2xl font-bold text-gray-900">{result.imported}</p>
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Imported</p>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{result.matched}</p>
                <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">Matched</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{result.unmatched}</p>
                <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Unmatched</p>
              </div>
            </div>

            {result.missingPayments && result.missingPayments.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                  <AlertCircle size={12} /> Missing payments — these invoices are past due
                </p>
                <div className="space-y-1">
                  {result.missingPayments.map((m) => (
                    <div key={m.number} className="flex items-center justify-between text-xs text-red-700">
                      <span className="font-mono">{m.number}</span>
                      <span className="font-semibold">{money(m.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={() => { setOpen(false); setResult(null); }} className="w-full btn-brand">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── New link dialog ──────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  { key: "meta_ads", label: "Meta Ads", color: "#1877f2" },
  { key: "google_ads", label: "Google Ads", color: "#4285f4" },
  { key: "google_analytics", label: "Google Analytics", color: "#e8710a" },
  { key: "shopify", label: "Shopify", color: "#96bf48" },
  { key: "slack", label: "Slack", color: "#4a154b" },
  { key: "drive", label: "Google Drive", color: "#4285f4" },
  { key: "notion", label: "Notion", color: "#000000" },
  { key: "figma", label: "Figma", color: "#f24e1e" },
  { key: "airtable", label: "Airtable", color: "#fcb400" },
  { key: "mailchimp", label: "Mailchimp", color: "#ffe01b" },
  { key: "custom", label: "Custom", color: "#99ff33" },
];

function NewLinkDialog({ clientId, onCreated }: { clientId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("custom");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/clients/${clientId}/links`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, label, url }),
    });
    onCreated();
    setOpen(false); setLabel(""); setUrl("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="btn-brand gap-1.5 h-8 px-3 shadow-none border-0 text-sm" />}>
        <Plus size={13} /> Add Link
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a marketing tool link</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Platform</Label>
            <Select value={platform} onValueChange={(v) => v && setPlatform(v)}>
              <SelectTrigger><SelectValue>{PLATFORM_OPTIONS.find((p) => p.key === platform)?.label}</SelectValue></SelectTrigger>
              <SelectContent>
                {PLATFORM_OPTIONS.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Label *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ads Manager, GA4 Dashboard" required />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">URL *</Label>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
          </div>
          <Button type="submit" className="w-full btn-brand">Add link</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const { success, error } = useToast();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [links, setLinks] = useState<ClientLink[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);

  const fetchClient = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${id}`);
      if (res.ok) setClient(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [id]);

  const fetchInvoices = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}/invoices`);
    if (res.ok) { const data = await res.json(); setInvoices(data.invoices || []); }
  }, [id]);

  const fetchPayments = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}/payments`);
    if (res.ok) { const data = await res.json(); setPayments(data.payments || []); }
  }, [id]);

  const fetchLinks = useCallback(async () => {
    const res = await fetch(`/api/clients/${id}/links`);
    if (res.ok) { const data = await res.json(); setLinks(data.links || []); }
  }, [id]);

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/tasks?clientId=${id}&limit=100`);
    if (res.ok) { const data = await res.json(); setTasks(data.tasks || []); }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchClient();
    fetchInvoices();
    fetchPayments();
    fetchLinks();
    fetchTasks();
  }, [fetchClient, fetchInvoices, fetchPayments, fetchLinks, fetchTasks]);

  async function save(patch: Partial<Client>) {
    if (!client) return;
    // Optimistic
    setClient({ ...client, ...patch });
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { error({ title: "Save failed" }); fetchClient(); }
  }

  async function markInvoice(invoiceId: string, status: Invoice["status"]) {
    setInvoices((prev) => prev.map((i) => (i.id === invoiceId ? { ...i, status, paidDate: status === "paid" ? new Date().toISOString() : i.paidDate } : i)));
    await fetch(`/api/clients/${id}/invoices/${invoiceId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchClient();
  }

  async function deleteInvoice(invoiceId: string) {
    const inv = invoices.find((i) => i.id === invoiceId);
    const ok = await confirm({
      title: "Delete invoice?",
      description: `Invoice ${inv?.number} will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
    await fetch(`/api/clients/${id}/invoices/${invoiceId}`, { method: "DELETE" });
    fetchClient();
  }

  async function deletePayment(paymentId: string) {
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    await fetch(`/api/clients/${id}/payments/${paymentId}`, { method: "DELETE" });
    fetchClient();
  }

  async function deleteLink(linkId: string) {
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
    await fetch(`/api/clients/${id}/links/${linkId}`, { method: "DELETE" });
  }

  if (loading || !client) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <div className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
        <div className="h-64 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    );
  }

  const status = STATUS_PALETTE[client.status];
  const s = client.stats;

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; count?: number }[] = [
    { key: "overview", label: "Overview", icon: FileText },
    { key: "projects", label: "Projects", icon: FolderOpen, count: client.projects?.length },
    { key: "tasks", label: "Tasks", icon: ListChecks, count: tasks.length },
    { key: "invoices", label: "Invoices", icon: Receipt, count: invoices.length },
    { key: "payments", label: "Payments", icon: Wallet, count: payments.length },
    { key: "links", label: "Links", icon: Link2, count: links.length },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 animate-fade-in bg-gray-50">
      {/* ── Header ── */}
      <div
        className="relative px-6 pt-4 pb-5 border-b border-gray-200 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${client.brandColor}22 0%, white 40%)`,
        }}
      >
        <Link href="/clients" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-3 transition-colors">
          <ArrowLeft size={12} /> Clients
        </Link>

        <div className="flex items-start gap-5">
          <LogoWithUpload client={client} onUpdate={fetchClient} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <EditableText
                value={client.name}
                onSave={(v) => save({ name: v })}
                className="text-2xl font-bold text-gray-900"
              />
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border", status.pill)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {client.industry && <span className="flex items-center gap-1"><Building2 size={10} /> {client.industry}</span>}
              {client.contactEmail && (
                <a href={`mailto:${client.contactEmail}`} className="flex items-center gap-1 hover:text-[#2d5200]">
                  <Mail size={10} /> {client.contactEmail}
                </a>
              )}
              {client.website && (
                <a href={client.website.startsWith("http") ? client.website : `https://${client.website}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#2d5200]">
                  <Globe size={10} /> {client.website.replace(/^https?:\/\//, "")}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        {s && (
          <div className="grid grid-cols-4 gap-3 mt-5">
            <StatBox label="Projects" value={String(s.projectCount)} icon={FolderOpen} accent="text-[#2d5200]" />
            <StatBox label="Invoiced" value={money(s.totalInvoiced, client.currency)} icon={Receipt} accent="text-gray-900" />
            <StatBox label="Outstanding" value={money(s.outstandingBalance, client.currency)} icon={DollarSign} accent={s.outstandingBalance > 0 ? "text-red-600" : "text-gray-400"} />
            <StatBox label="Received" value={money(s.totalReceived, client.currency)} icon={CheckCircle2} accent="text-green-700" />
          </div>
        )}
      </div>

      {/* ── Tab strip ── */}
      <div className="flex overflow-x-auto scrollbar-none border-b border-gray-200 bg-white px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors",
              tab === t.key
                ? "border-[#99ff33] text-[#2d5200] font-semibold bg-gradient-to-b from-transparent to-[#99ff33]/[0.05]"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200"
            )}
          >
            <t.icon size={13} />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-0.5 bg-gray-100 text-gray-600 px-1.5 rounded-full text-[10px] font-semibold">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {tab === "overview" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card title="Brief">
              <EditableText
                value={client.brief ?? ""}
                placeholder="Add a brief about this client — goals, scope, target audience…"
                onSave={(v) => save({ brief: v || null })}
                multiline
                className="text-sm text-gray-700"
              />
            </Card>

            <div className="grid grid-cols-2 gap-4">
              <Card title="Contact">
                <div className="space-y-2 text-sm">
                  <Field label="Primary contact">
                    <EditableText value={client.contactName ?? ""} placeholder="Name" onSave={(v) => save({ contactName: v || null })} />
                  </Field>
                  <Field label="Email">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <EditableText value={client.contactEmail ?? ""} placeholder="email@…" onSave={(v) => save({ contactEmail: v || null })} />
                      {client.contactEmail && (
                        <a
                          href={`mailto:${client.contactEmail}`}
                          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-[#2d5200] hover:bg-[#99ff33]/10"
                          title="Send email"
                        >
                          <Mail size={11} />
                        </a>
                      )}
                    </div>
                  </Field>
                  <Field label="Phone">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <EditableText value={client.contactPhone ?? ""} placeholder="+60 12-345…" onSave={(v) => save({ contactPhone: v || null })} />
                      {client.contactPhone && (
                        <a
                          href={`tel:${client.contactPhone.replace(/[^0-9+]/g, "")}`}
                          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-[#2d5200] hover:bg-[#99ff33]/10"
                          title="Call"
                        >
                          <Phone size={11} />
                        </a>
                      )}
                    </div>
                  </Field>
                  <Field label="WhatsApp">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <EditableText
                        value={client.whatsapp ?? ""}
                        placeholder="60123456789 (no +, no dashes)"
                        onSave={(v) => save({ whatsapp: v ? v.replace(/[^0-9]/g, "") || null : null } as Partial<Client>)}
                      />
                      {client.whatsapp && (
                        <a
                          href={`https://wa.me/${client.whatsapp.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50"
                          title="Open WhatsApp"
                        >
                          {/* WhatsApp glyph */}
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                  </Field>
                  <Field label="Website">
                    <EditableText value={client.website ?? ""} placeholder="acme.com" onSave={(v) => save({ website: v || null })} />
                  </Field>
                </div>
              </Card>

              <Card title="Billing">
                <div className="space-y-2 text-sm">
                  <Field label="Billing address">
                    <EditableText value={client.billingAddress ?? ""} placeholder="Address" onSave={(v) => save({ billingAddress: v || null })} multiline />
                  </Field>
                  <Field label="Tax ID">
                    <EditableText value={client.taxId ?? ""} placeholder="e.g. VAT / EIN" onSave={(v) => save({ taxId: v || null })} />
                  </Field>
                  <Field label="Currency">
                    <EditableText value={client.currency} placeholder="USD" onSave={(v) => save({ currency: v || "USD" })} />
                  </Field>
                </div>
              </Card>
            </div>

            <Card title="Internal notes">
              <EditableText
                value={client.notes ?? ""}
                placeholder="Private notes about this client — not shown on invoices"
                onSave={(v) => save({ notes: v || null })}
                multiline
                className="text-sm text-gray-700"
              />
            </Card>

            {/* Activity feed — recent task / project events for this client */}
            <ActivityFeed clientId={id} projectIds={(client.projects ?? []).map((p) => p.id)} />
          </div>
        )}

        {tab === "projects" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Linked projects */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Linked Projects</h3>
              {client.projects && client.projects.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {client.projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`}
                      className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200 hover:border-[#99ff33]/60 hover:shadow-[0_4px_20px_rgb(153_255_51/0.12)] transition-all">
                      <ProjectColorDot icon={p.icon} color={p.color} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                        {p.campaign && <p className="text-[11px] text-gray-500 truncate">{p.campaign}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-2">No projects linked yet. Create a project and assign this client.</p>
              )}
            </div>

            {/* Google Drive files */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <HardDrive size={12} className="text-[#4285f4]" />
                Client Files
              </h3>
              <ClientDrivePanel clientId={client.id} clientName={client.name} />
            </div>
          </div>
        )}

        {tab === "tasks" && (
          <div className="max-w-4xl mx-auto">
            {tasks.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {tasks.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {t.project?.name}
                        {t.dueDate && ` · due ${new Date(t.dueDate).toLocaleDateString()}`}
                      </p>
                    </div>
                    <StatusPill status={t.status} />
                    <PriorityPill priority={t.priority} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={ListChecks} title="No tasks" desc="Tasks from projects linked to this client will appear here." />
            )}
          </div>
        )}

        {tab === "invoices" && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">All invoices</h3>
              <NewInvoiceDialog clientId={id} currency={client.currency} onCreated={() => { fetchInvoices(); fetchClient(); }} />
            </div>
            {invoices.length === 0 ? (
              <EmptyState icon={Receipt} title="No invoices" desc="Create your first invoice to start tracking billing." />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {invoices.map((inv) => {
                  const st = INVOICE_STATUS[inv.status];
                  return (
                    <div key={inv.id} className="group flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs text-gray-500">{inv.number}</p>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", st.pill)}>{st.label}</span>
                        </div>
                        {inv.title && <p className="text-sm text-gray-800 mt-0.5 truncate">{inv.title}</p>}
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {inv.issuedDate && `Issued ${new Date(inv.issuedDate).toLocaleDateString()}`}
                          {inv.dueDate && ` · due ${new Date(inv.dueDate).toLocaleDateString()}`}
                          {inv.paidDate && ` · paid ${new Date(inv.paidDate).toLocaleDateString()}`}
                        </p>
                      </div>
                      <p className="font-bold text-gray-900 tabular-nums">{money(inv.amount, inv.currency)}</p>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        {inv.status !== "paid" && (
                          <button onClick={() => markInvoice(inv.id, "paid")}
                            className="text-[11px] text-green-700 hover:text-green-800 font-semibold px-2 py-1 rounded-md hover:bg-green-50">
                            Mark paid
                          </button>
                        )}
                        <button onClick={() => deleteInvoice(inv.id)}
                          className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Payment history</h3>
              <div className="flex items-center gap-2">
                <ImportBankDialog clientId={id} onCompleted={() => { fetchPayments(); fetchInvoices(); fetchClient(); }} />
                <NewPaymentDialog clientId={id} invoices={invoices} onCreated={() => { fetchPayments(); fetchClient(); }} />
              </div>
            </div>
            {payments.length === 0 ? (
              <EmptyState icon={Wallet} title="No payments yet" desc="Record a payment manually or import a bank CSV to auto-match." />
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {payments.map((p) => (
                  <div key={p.id} className="group flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <div className="h-8 w-8 rounded-lg bg-green-50 flex items-center justify-center">
                      <CheckCircle2 size={14} className="text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">{money(p.amount, p.currency)}</p>
                        {p.matched && p.invoice && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-green-700 font-mono">
                            {p.invoice.number}
                          </span>
                        )}
                        {!p.matched && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium">
                            Unmatched
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 uppercase">{p.source.replace("_", " ")}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {new Date(p.paymentDate).toLocaleDateString()}
                        {p.reference && ` · ${p.reference}`}
                        {p.rawDescription && ` · ${p.rawDescription}`}
                      </p>
                    </div>
                    <button onClick={() => deletePayment(p.id)}
                      className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "links" && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Marketing & tool links</h3>
              <NewLinkDialog clientId={id} onCreated={fetchLinks} />
            </div>
            {links.length === 0 ? (
              <EmptyState icon={Link2} title="No links yet" desc="Add quick links to this client's Meta Ads, Google Analytics, Slack channel, etc." />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {links.map((l) => {
                  const plat = PLATFORM_OPTIONS.find((p) => p.key === l.platform);
                  return (
                    <div key={l.id} className="group flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 hover:border-[#99ff33]/60 hover:shadow-sm transition-all">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[10px] uppercase text-white shrink-0"
                        style={{ backgroundColor: plat?.color || "#99ff33" }}
                      >
                        {(plat?.label || l.platform).slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-800 hover:text-[#2d5200] truncate block">
                          {l.label}
                        </a>
                        <p className="text-[11px] text-gray-400 truncate">{plat?.label || l.platform}</p>
                      </div>
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                        <ExternalLink size={13} />
                      </a>
                      <button onClick={() => deleteLink(l.id)} className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-600 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "settings" && (
          <div className="max-w-xl mx-auto space-y-4">
            <Card title="Services">
              <p className="text-xs text-gray-500 mb-3">Categorize what services you provide for this client. Used to group on the Clients page.</p>
              <div className="flex flex-wrap gap-1.5">
                {SERVICE_CATEGORIES.map((s) => {
                  const current = parseServices(client.services);
                  const active = current.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => {
                        const next = active ? current.filter((x) => x !== s.key) : [...current, s.key];
                        save({ services: JSON.stringify(next) as unknown as never });
                      }}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium transition-all border flex items-center gap-1",
                      )}
                      style={
                        active
                          ? { backgroundColor: `${s.color}20`, color: s.color, borderColor: `${s.color}80` }
                          : { backgroundColor: "white", color: "#6b7280", borderColor: "#e5e7eb" }
                      }
                    >
                      <span>{s.emoji}</span>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card title="Brand">
              <div className="space-y-2">
                <Field label="Brand color">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-md ring-1 ring-gray-200" style={{ backgroundColor: client.brandColor }} />
                    <input
                      type="color"
                      value={client.brandColor}
                      onChange={(e) => save({ brandColor: e.target.value })}
                      className="h-8 w-12 cursor-pointer"
                    />
                    <span className="text-sm font-mono text-gray-500">{client.brandColor}</span>
                  </div>
                </Field>
              </div>
            </Card>

            <Card title="Status">
              <Select value={client.status} onValueChange={(v) => v && save({ status: v as Client["status"] })}>
                <SelectTrigger><SelectValue>{STATUS_PALETTE[client.status].label}</SelectValue></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_PALETTE) as Client["status"][]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_PALETTE[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Card>

            <Card title="Danger">
              <Button
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={async () => {
                  const ok = await confirm({
                    title: "Delete client?",
                    description: `"${client.name}" and all invoices, payments, links will be permanently removed. Projects will be unlinked.`,
                    confirmLabel: "Delete",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
                  if (res.ok) {
                    success({ title: "Client deleted" });
                    router.push("/clients");
                  } else error({ title: "Failed to delete" });
                }}
              >
                <Trash2 size={13} /> Delete client
              </Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatBox({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }>; accent: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white/80 backdrop-blur p-3">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon size={10} className={accent} />
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">{label}</span>
      </div>
      <p className={cn("text-base font-bold tabular-nums", accent)}>{value}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-500 w-28 shrink-0 pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white px-6 py-16 text-center">
      <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <Icon size={20} className="text-gray-400" />
      </div>
      <p className="font-semibold text-gray-800 mb-1">{title}</p>
      <p className="text-sm text-gray-500">{desc}</p>
    </div>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

type ActivityEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user: { id: string; name: string } | null;
};

function relativeTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ActivityFeed({ clientId, projectIds }: { clientId: string; projectIds: string[] }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    if (projectIds.length === 0) { setLoading(false); return; }
    setLoading(true);
    // Pull activity for each project in parallel and merge by date
    Promise.all(
      projectIds.map((pid) =>
        fetch(`/api/activity?projectId=${pid}&limit=20`).then((r) => (r.ok ? r.json() : { entries: [] }))
      )
    )
      .then((results) => {
        const merged: ActivityEntry[] = results
          .flatMap((r) => r.entries || [])
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 10);
        setEntries(merged);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientId, projectIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function describe(a: ActivityEntry) {
    if (a.action === "completed") return "completed";
    if (a.action === "created") return "created";
    if (a.action === "deleted") return "deleted";
    if (a.action === "assigned") return "was assigned to";
    if (a.action === "updated" && a.field === "status") return `changed status → ${a.newValue ?? ""}`;
    if (a.action === "updated" && a.field === "priority") return `changed priority → ${a.newValue ?? ""}`;
    if (a.action === "updated") return "updated";
    return a.action;
  }

  return (
    <Card title="Recent activity">
      {projectIds.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-3 text-center">
          Link a project to start seeing activity here.
        </p>
      ) : loading ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-gray-100 animate-pulse" />)}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-3 text-center">
          No recent activity yet.
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((a) => (
            <div key={a.id} className="flex items-start gap-2 text-xs">
              <div className="h-6 w-6 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                {a.user?.name?.[0]?.toUpperCase() ?? "·"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 leading-snug">
                  <span className="font-medium text-gray-900">{a.user?.name ?? "Someone"}</span>{" "}
                  <span className="text-gray-500">{describe(a)}</span>
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">{relativeTime(a.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
