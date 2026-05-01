"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Document = {
  id: string;
  filename: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy?: { name: string } | null;
};

type Props = {
  projectId: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const typeColors: Record<string, string> = {
  pdf: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  doc: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  docx: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  ppt: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  pptx: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
};

export function DocumentList({ projectId }: Props) {
  const confirm = useConfirm();
  const { error: toastError } = useToast();
  const [docs, setDocs] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchDocs = useCallback(async () => {
    const res = await fetch(`/api/documents?projectId=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents || []);
    }
  }, [projectId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function uploadFile(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("projectId", projectId);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: formData });
      if (res.ok) {
        fetchDocs();
      } else {
        const err = await res.json().catch(() => ({}));
        toastError({ title: "Upload failed", description: err.error || "Please try again." });
      }
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  async function handleDelete(docId: string, filename: string) {
    const ok = await confirm({
      title: "Delete document?",
      description: `"${filename}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/documents/${docId}`, { method: "DELETE" });
    fetchDocs();
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
      >
        <p className="text-sm text-muted-foreground">
          {uploading ? "Uploading..." : "Drag & drop a file here, or"}
        </p>
        <label className="mt-2 inline-block">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile(file);
            }}
            disabled={uploading}
          />
          <Button variant="secondary" size="sm" className="mt-2" disabled={uploading}>
            Browse files
          </Button>
        </label>
        <p className="text-xs text-muted-foreground mt-2">PDF, DOC, DOCX, PPT, PPTX</p>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No documents uploaded yet</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
              <Badge className={typeColors[doc.fileType] || ""}>
                {doc.fileType.toUpperCase()}
              </Badge>
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/documents/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {doc.filename}
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatSize(doc.fileSize)} &middot; {doc.uploadedBy?.name || "Unknown"} &middot;{" "}
                  {new Date(doc.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(doc.id, doc.filename)}
                className="text-muted-foreground hover:text-destructive"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
