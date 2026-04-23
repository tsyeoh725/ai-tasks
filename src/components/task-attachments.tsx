"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

type Attachment = {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
  user?: { name: string };
};

export function TaskAttachments({ taskId }: { taskId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchAttachments();
  }, [taskId]);

  async function fetchAttachments() {
    const res = await fetch(`/api/tasks/${taskId}/attachments`);
    const data = await res.json();
    setAttachments(data.attachments || []);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "POST",
      body: formData,
    });

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    fetchAttachments();
  }

  async function handleDelete(attachmentId: string) {
    await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
    });
    fetchAttachments();
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const fileIcons: Record<string, string> = {
    pdf: "\u{1F4C4}",
    doc: "\u{1F4DD}",
    docx: "\u{1F4DD}",
    png: "\u{1F5BC}\u{FE0F}",
    jpg: "\u{1F5BC}\u{FE0F}",
    jpeg: "\u{1F5BC}\u{FE0F}",
    gif: "\u{1F5BC}\u{FE0F}",
    zip: "\u{1F4E6}",
  };

  return (
    <div className="space-y-2">
      {attachments.map((att) => {
        const ext = att.fileName.split(".").pop()?.toLowerCase() || "";
        return (
          <div key={att.id} className="flex items-center gap-2 text-sm group border rounded-md px-3 py-2">
            <span className="text-base">{fileIcons[ext] || "\u{1F4CE}"}</span>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{att.fileName}</p>
              <p className="text-xs text-muted-foreground">
                {formatSize(att.fileSize)} &middot; {att.user?.name || "Unknown"}
              </p>
            </div>
            <button
              onClick={() => handleDelete(att.id)}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
              type="button"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        );
      })}

      <input
        ref={fileRef}
        type="file"
        onChange={handleUpload}
        className="hidden"
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="text-xs"
      >
        <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        {uploading ? "Uploading..." : "Attach file"}
      </Button>
    </div>
  );
}
