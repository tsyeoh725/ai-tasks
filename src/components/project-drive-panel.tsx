"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

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

type DriveFolder = { id: string; name: string };

const MIME_ICONS: Record<string, string> = {
  "application/vnd.google-apps.folder": "📁",
  "application/vnd.google-apps.document": "📄",
  "application/vnd.google-apps.spreadsheet": "📊",
  "application/vnd.google-apps.presentation": "📑",
  "application/pdf": "📋",
  "image/jpeg": "🖼️",
  "image/png": "🖼️",
  "video/mp4": "🎬",
};

function mimeIcon(mimeType: string) {
  return MIME_ICONS[mimeType] ?? "📎";
}

function formatBytes(bytes?: string) {
  if (!bytes) return "";
  const n = parseInt(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectDrivePanel({ projectId }: { projectId: string }) {
  const [linked, setLinked] = useState(false);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ocrFile, setOcrFile] = useState<DriveFile | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [customFolderId, setCustomFolderId] = useState("");

  async function fetchDriveData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/drive`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Drive error"); return; }
      setLinked(data.linked ?? false);
      setFolderId(data.folderId ?? null);
      setFolderName(data.folderName ?? null);
      setFiles(data.files ?? []);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  async function fetchFolders() {
    try {
      const res = await fetch("/api/drive");
      const data = await res.json();
      setFolders(data.drives ?? []);
    } catch { /* ignore */ }
  }

  useEffect(() => { fetchDriveData(); }, [projectId]);

  async function handleCreateFolder() {
    const res = await fetch(`/api/projects/${projectId}/drive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ create: true }),
    });
    const data = await res.json();
    if (res.ok) { fetchDriveData(); }
    else { setError(data.error ?? "Could not create folder"); }
  }

  async function handleLinkFolder(id: string, name: string) {
    const res = await fetch(`/api/projects/${projectId}/drive`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: id, folderName: name }),
    });
    if (res.ok) { setShowLinkPicker(false); fetchDriveData(); }
  }

  async function handleUnlink() {
    await fetch(`/api/projects/${projectId}/drive`, { method: "DELETE" });
    setLinked(false); setFiles([]); setFolderId(null); setFolderName(null);
  }

  async function handleOcr(file: DriveFile) {
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

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;

  if (error?.includes("No Google account") || error?.includes("not linked")) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-4">
        <p className="text-muted-foreground">No Google account connected. Connect your Google account to link Drive folders.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Google Drive</h2>
          {linked && folderId && (
            <p className="text-sm text-muted-foreground">
              Linked to: <a href={`https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{folderName ?? folderId}</a>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {linked ? (
            <>
              <Button variant="outline" size="sm" onClick={fetchDriveData}>Refresh</Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={handleUnlink}>Unlink</Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleCreateFolder}>Create Folder in Drive</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowLinkPicker(!showLinkPicker); fetchFolders(); }}>Link Existing</Button>
            </>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showLinkPicker && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium">Choose a folder to link:</p>
            {folders.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {folders.map((f) => (
                  <button key={f.id} onClick={() => handleLinkFolder(f.id, f.name)} className="w-full text-left px-3 py-2 rounded hover:bg-accent text-sm flex items-center gap-2">
                    <span>📁</span> {f.name}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={customFolderId} onChange={(e) => setCustomFolderId(e.target.value)} placeholder="Paste Drive folder ID" className="flex-1" />
              <Button size="sm" onClick={() => handleLinkFolder(customFolderId, customFolderId)}>Link</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {linked && files.length === 0 && (
        <p className="text-muted-foreground text-sm">No files in this folder yet.</p>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => {
            const canOcr = ["application/vnd.google-apps.document", "application/pdf", "image/jpeg", "image/png"].includes(file.mimeType);
            return (
              <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg border hover:bg-accent/30 group">
                <span className="text-xl shrink-0">{mimeIcon(file.mimeType)}</span>
                <div className="flex-1 min-w-0">
                  <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                    {file.name}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                    {file.modifiedTime && ` · ${new Date(file.modifiedTime).toLocaleDateString()}`}
                  </p>
                </div>
                {file.thumbnailLink && (
                  <img src={file.thumbnailLink} alt="" className="h-10 w-10 object-cover rounded border shrink-0" />
                )}
                {canOcr && (
                  <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 text-xs h-7"
                    onClick={() => handleOcr(file)}>
                    Extract Text
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ocrFile && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Text from: {ocrFile.name}</p>
            <Button size="sm" variant="ghost" onClick={() => { setOcrFile(null); setOcrText(null); }}>×</Button>
          </div>
          {ocrLoading ? (
            <p className="text-sm text-muted-foreground">Extracting text…</p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap max-h-64 overflow-y-auto text-muted-foreground">{ocrText}</pre>
          )}
        </div>
      )}
    </div>
  );
}
