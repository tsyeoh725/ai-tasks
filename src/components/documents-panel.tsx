"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  LayoutGrid,
  List,
  Upload,
  Search,
  ExternalLink,
  Trash2,
  FolderOpen,
  Link2,
  RefreshCw,
  X,
  FileText,
  FileSpreadsheet,
  FileVideo,
  Image,
  File,
  ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type LocalDoc = {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy?: { name: string } | null;
};

type DriveFolder = { id: string; name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: string | number) {
  const n = typeof bytes === "string" ? parseInt(bytes) : bytes ?? 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DriveFileIcon({ mimeType, size = 20 }: { mimeType: string; size?: number }) {
  const s = size;
  if (mimeType === "application/vnd.google-apps.folder")
    return <FolderOpen size={s} className="text-yellow-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileSpreadsheet size={s} className="text-green-600" />;
  if (mimeType.includes("document") || mimeType.includes("word"))
    return <FileText size={s} className="text-blue-600" />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return <File size={s} className="text-orange-500" />;
  if (mimeType.includes("pdf"))
    return <FileText size={s} className="text-red-600" />;
  if (mimeType.startsWith("image/"))
    return <Image size={s} className="text-purple-500" />;
  if (mimeType.startsWith("video/"))
    return <FileVideo size={s} className="text-pink-500" />;
  return <File size={s} className="text-gray-500" />;
}

function LocalFileIcon({ ext }: { ext: string }) {
  const e = ext.toLowerCase();
  if (e === "pdf") return <FileText size={20} className="text-red-600" />;
  if (["doc", "docx"].includes(e)) return <FileText size={20} className="text-blue-600" />;
  if (["xls", "xlsx"].includes(e)) return <FileSpreadsheet size={20} className="text-green-600" />;
  if (["ppt", "pptx"].includes(e)) return <File size={20} className="text-orange-500" />;
  return <File size={20} className="text-gray-500" />;
}

// ─── Grid card ────────────────────────────────────────────────────────────────

function DriveFileCard({ file, onOcr }: { file: DriveFile; onOcr?: (f: DriveFile) => void }) {
  const canOcr = ["application/vnd.google-apps.document", "application/pdf", "image/jpeg", "image/png"].includes(file.mimeType);
  return (
    <div className="group flex flex-col rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer overflow-hidden">
      {/* Preview area */}
      <div className="h-28 bg-gray-50 flex items-center justify-center relative overflow-hidden">
        {file.thumbnailLink ? (
          <img src={file.thumbnailLink} alt="" className="w-full h-full object-cover" />
        ) : (
          <DriveFileIcon mimeType={file.mimeType} size={36} />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {file.webViewLink && (
            <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 shadow-sm">
              <ExternalLink size={12} className="text-gray-600" />
            </a>
          )}
        </div>
      </div>
      {/* Footer */}
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-800 truncate">{file.name}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ""}
          {file.size ? ` · ${formatBytes(file.size)}` : ""}
        </p>
        {canOcr && onOcr && (
          <button onClick={() => onOcr(file)}
            className="mt-1.5 text-[10px] text-indigo-600 hover:underline">
            Extract text
          </button>
        )}
      </div>
    </div>
  );
}

function LocalFileCard({ doc, onDelete }: { doc: LocalDoc; onDelete: (id: string, name: string) => void }) {
  return (
    <div className="group flex flex-col rounded-xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all overflow-hidden">
      <div className="h-28 bg-gray-50 flex items-center justify-center relative">
        <LocalFileIcon ext={doc.fileType} />
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
            className="h-7 w-7 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 shadow-sm">
            <ExternalLink size={12} className="text-gray-600" />
          </a>
          <button onClick={() => onDelete(doc.id, doc.filename)}
            className="h-7 w-7 rounded-md bg-white border border-gray-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 shadow-sm">
            <Trash2 size={12} className="text-red-500" />
          </button>
        </div>
      </div>
      <div className="p-2.5">
        <p className="text-xs font-medium text-gray-800 truncate">{doc.filename}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {doc.uploadedBy?.name || "You"} · {new Date(doc.createdAt).toLocaleDateString()}
          {` · ${formatBytes(doc.fileSize)}`}
        </p>
      </div>
    </div>
  );
}

// ─── Row variants ─────────────────────────────────────────────────────────────

function DriveFileRow({ file, onOcr }: { file: DriveFile; onOcr?: (f: DriveFile) => void }) {
  const canOcr = ["application/vnd.google-apps.document", "application/pdf", "image/jpeg", "image/png"].includes(file.mimeType);
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-colors">
      <DriveFileIcon mimeType={file.mimeType} size={18} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 truncate font-medium">{file.name}</p>
      </div>
      <span className="text-xs text-gray-400 shrink-0 w-20 text-right">{formatBytes(file.size)}</span>
      <span className="text-xs text-gray-400 shrink-0 w-24 text-right">
        {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ""}
      </span>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {canOcr && onOcr && (
          <button onClick={() => onOcr(file)} className="text-[11px] text-indigo-600 hover:underline px-1">Extract</button>
        )}
        {file.webViewLink && (
          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer"
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-gray-200 text-gray-500">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function LocalFileRow({ doc, onDelete }: { doc: LocalDoc; onDelete: (id: string, name: string) => void }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-200 transition-colors">
      <LocalFileIcon ext={doc.fileType} />
      <div className="flex-1 min-w-0">
        <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
          className="text-sm text-gray-800 truncate font-medium hover:underline">{doc.filename}</a>
      </div>
      <span className="text-xs text-gray-400 shrink-0 w-20 text-right">{formatBytes(doc.fileSize)}</span>
      <span className="text-xs text-gray-400 shrink-0 w-24 text-right">
        {new Date(doc.createdAt).toLocaleDateString()}
      </span>
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onDelete(doc.id, doc.filename)}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  count,
  collapsed,
  onToggle,
  actions,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 flex-1 min-w-0"
      >
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform shrink-0 ${collapsed ? "-rotate-90" : ""}`}
        />
        {icon}
        <span>{label}</span>
        {count !== undefined && (
          <span className="text-xs text-gray-400 ml-1">({count})</span>
        )}
      </button>
      {actions}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentsPanel({ projectId }: { projectId: string }) {
  const confirm = useConfirm();
  const { error: toastError, success: toastSuccess } = useToast();

  const [view, setView] = useState<"grid" | "list">("list");
  const [search, setSearch] = useState("");
  const [driveLinked, setDriveLinked] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveFolderName, setDriveFolderName] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [localDocs, setLocalDocs] = useState<LocalDoc[]>([]);
  const [localLoading, setLocalLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [customFolderId, setCustomFolderId] = useState("");
  const [driveCollapsed, setDriveCollapsed] = useState(false);
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [ocrFile, setOcrFile] = useState<DriveFile | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  // ── Fetch Drive ──
  const fetchDrive = useCallback(async () => {
    setDriveLoading(true);
    setDriveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/drive`);
      const data = await res.json();
      if (!res.ok) { setDriveError(data.error ?? "Drive error"); return; }
      setDriveLinked(data.linked ?? false);
      setDriveFolderId(data.folderId ?? null);
      setDriveFolderName(data.folderName ?? null);
      setDriveFiles(data.files ?? []);
    } catch { setDriveError("Network error"); }
    finally { setDriveLoading(false); }
  }, [projectId]);

  // ── Fetch local docs ──
  const fetchLocal = useCallback(async () => {
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/documents?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setLocalDocs(data.documents || []);
      }
    } finally { setLocalLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchDrive(); fetchLocal(); }, [fetchDrive, fetchLocal]);

  // ── Drive actions ──
  async function fetchFolders() {
    try {
      const res = await fetch("/api/drive");
      const data = await res.json();
      setFolders(data.drives ?? []);
    } catch { /* ignore */ }
  }

  async function createDriveFolder() {
    setSyncing(true);
    const res = await fetch(`/api/projects/${projectId}/drive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create: true }),
    });
    setSyncing(false);
    if (res.ok) { fetchDrive(); toastSuccess({ title: "Drive folder created" }); }
    else { const d = await res.json(); toastError({ title: d.error ?? "Could not create folder" }); }
  }

  async function linkFolder(id: string, name: string) {
    const res = await fetch(`/api/projects/${projectId}/drive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: id, folderName: name }),
    });
    if (res.ok) { setShowLinkPicker(false); fetchDrive(); }
  }

  async function unlinkDrive() {
    await fetch(`/api/projects/${projectId}/drive`, { method: "DELETE" });
    setDriveLinked(false); setDriveFiles([]); setDriveFolderId(null); setDriveFolderName(null);
  }

  // ── Local upload ──
  async function uploadFile(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (res.ok) { fetchLocal(); toastSuccess({ title: "File uploaded" }); }
      else { const err = await res.json().catch(() => ({})); toastError({ title: "Upload failed", description: err.error }); }
    } finally { setUploading(false); }
  }

  async function deleteLocal(docId: string, filename: string) {
    const ok = await confirm({
      title: "Delete document?",
      description: `"${filename}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    fetchLocal();
  }

  // ── OCR ──
  async function runOcr(file: DriveFile) {
    setOcrFile(file); setOcrText(null); setOcrLoading(true);
    try {
      const res = await fetch("/api/drive/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, mimeType: file.mimeType }),
      });
      const data = await res.json();
      setOcrText(data.text ?? data.error ?? "No text found");
    } catch { setOcrText("Error extracting text"); }
    finally { setOcrLoading(false); }
  }

  // ── Filter ──
  const filteredDrive = driveFiles.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredLocal = localDocs.filter((d) =>
    d.filename.toLowerCase().includes(search.toLowerCase())
  );

  const noGoogle = driveError?.includes("No Google account") || driveError?.includes("not linked") || driveError?.includes("credentials");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="h-8 pl-7 text-sm border-gray-200"
          />
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setView("list")}
            className={`h-6 w-6 flex items-center justify-center rounded-md transition-colors ${view === "list" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List size={13} />
          </button>
          <button
            onClick={() => setView("grid")}
            className={`h-6 w-6 flex items-center justify-center rounded-md transition-colors ${view === "grid" ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>
        <label className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${uploading ? "border-gray-200 text-gray-400 bg-gray-50" : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"}`}>
          <Upload size={13} />
          {uploading ? "Uploading…" : "Upload"}
          <input type="file" className="hidden" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
        </label>
      </div>

      {/* ── Body ── */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-6"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
      >
        {dragOver && (
          <div className="fixed inset-0 z-50 bg-indigo-50/80 border-2 border-dashed border-indigo-400 flex items-center justify-center pointer-events-none">
            <p className="text-indigo-700 font-medium text-lg">Drop to upload</p>
          </div>
        )}

        {/* ── Google Drive section ── */}
        <div>
          <SectionHeader
            icon={
              <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
            }
            label="Google Drive"
            count={driveLinked ? filteredDrive.length : undefined}
            collapsed={driveCollapsed}
            onToggle={() => setDriveCollapsed((v) => !v)}
            actions={
              driveLinked ? (
                <div className="flex items-center gap-1">
                  {driveFolderId && (
                    <a
                      href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors"
                    >
                      <ExternalLink size={11} /> Open in Drive
                    </a>
                  )}
                  <button
                    onClick={() => fetchDrive()}
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <RefreshCw size={12} className={syncing ? "animate-spin" : ""} />
                  </button>
                  <button
                    onClick={unlinkDrive}
                    className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                  >
                    Unlink
                  </button>
                </div>
              ) : null
            }
          />

          {!driveCollapsed && (
            <>
              {driveLoading ? (
                <div className="grid grid-cols-4 gap-3 mt-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-36 rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </div>
              ) : noGoogle ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center mt-2">
                  <svg width="32" height="32" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-3">
                    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 27h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                  </svg>
                  <p className="text-sm font-medium text-gray-700 mb-1">Connect Google Drive</p>
                  <p className="text-xs text-gray-500 mb-4">Link a Drive folder to browse and access your files directly from this project.</p>
                  <p className="text-xs text-gray-400">Sign in with Google in Settings to enable Drive access.</p>
                </div>
              ) : !driveLinked ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-8 mt-2">
                  <p className="text-sm font-medium text-gray-700 mb-3">No Drive folder linked</p>
                  <p className="text-xs text-gray-500 mb-4">Create a new folder in Drive for this project, or link an existing one.</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" onClick={createDriveFolder} disabled={syncing}>
                      <FolderOpen size={14} className="mr-1.5" /> Create folder
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setShowLinkPicker(!showLinkPicker); fetchFolders(); }}>
                      <Link2 size={14} className="mr-1.5" /> Link existing
                    </Button>
                  </div>

                  {showLinkPicker && (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 space-y-2">
                      {folders.length > 0 && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {folders.map((f) => (
                            <button key={f.id} onClick={() => linkFolder(f.id, f.name)}
                              className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm flex items-center gap-2 text-gray-700">
                              <FolderOpen size={14} className="text-yellow-500" /> {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Input value={customFolderId} onChange={(e) => setCustomFolderId(e.target.value)}
                          placeholder="Or paste Drive folder ID…" className="flex-1 h-8 text-sm" />
                        <Button size="sm" onClick={() => linkFolder(customFolderId, customFolderId)}>Link</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : filteredDrive.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 mt-2">No files in this Drive folder.</p>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-2">
                  {filteredDrive.map((f) => <DriveFileCard key={f.id} file={f} onOcr={runOcr} />)}
                </div>
              ) : (
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <span className="w-5 shrink-0" />
                    <span className="flex-1">Name</span>
                    <span className="w-20 text-right">Size</span>
                    <span className="w-24 text-right">Modified</span>
                    <span className="w-16" />
                  </div>
                  {filteredDrive.map((f) => <DriveFileRow key={f.id} file={f} onOcr={runOcr} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Local uploads section ── */}
        <div>
          <SectionHeader
            icon={<Upload size={14} className="text-gray-500" />}
            label="Uploaded Files"
            count={filteredLocal.length}
            collapsed={localCollapsed}
            onToggle={() => setLocalCollapsed((v) => !v)}
          />

          {!localCollapsed && (
            <>
              {localLoading ? (
                <div className="space-y-2 mt-2">
                  {[1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
                </div>
              ) : filteredLocal.length === 0 && !dragOver ? (
                <div
                  className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center mt-2 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
                >
                  <Upload size={24} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm text-gray-500">Drag & drop files here</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX, PPT, PPTX</p>
                </div>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mt-2">
                  {filteredLocal.map((d) => <LocalFileCard key={d.id} doc={d} onDelete={deleteLocal} />)}
                </div>
              ) : (
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <span className="w-5 shrink-0" />
                    <span className="flex-1">Name</span>
                    <span className="w-20 text-right">Size</span>
                    <span className="w-24 text-right">Uploaded</span>
                    <span className="w-7" />
                  </div>
                  {filteredLocal.map((d) => <LocalFileRow key={d.id} doc={d} onDelete={deleteLocal} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── OCR result ── */}
        {ocrFile && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">Extracted text: {ocrFile.name}</p>
              <button onClick={() => { setOcrFile(null); setOcrText(null); }}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400">
                <X size={14} />
              </button>
            </div>
            {ocrLoading ? (
              <p className="text-sm text-gray-400">Extracting…</p>
            ) : (
              <pre className="text-xs whitespace-pre-wrap max-h-64 overflow-y-auto text-gray-600 bg-gray-50 rounded-lg p-3">{ocrText}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
