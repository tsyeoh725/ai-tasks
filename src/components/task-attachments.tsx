"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Paperclip,
  Upload,
  Download,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileVideo,
  Image as ImageIcon,
  File as FileIcon,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Attachment = {
  id: string;
  taskId: string;
  userId: string;
  fileName: string;
  fileType: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  user?: { id: string; name: string };
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIconFor({ name, type }: { name: string; type: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
    return <ImageIcon size={18} className="text-purple-500 shrink-0" />;
  if (type.startsWith("video/") || ["mp4", "mov", "avi", "webm"].includes(ext))
    return <FileVideo size={18} className="text-pink-500 shrink-0" />;
  if (type.includes("pdf") || ext === "pdf")
    return <FileText size={18} className="text-red-600 shrink-0" />;
  if (["xls", "xlsx", "csv"].includes(ext))
    return <FileSpreadsheet size={18} className="text-green-600 shrink-0" />;
  if (["doc", "docx"].includes(ext))
    return <FileText size={18} className="text-blue-600 shrink-0" />;
  return <FileIcon size={18} className="text-gray-500 shrink-0" />;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const confirm = useConfirm();
  const { success: toastSuccess, error: toastError } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fetchAttachments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.attachments || []);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, [taskId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  async function uploadFile(file: File) {
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        fetchAttachments();
        toastSuccess({ title: "File attached", description: file.name });
      } else {
        const err = await res.json().catch(() => ({}));
        toastError({ title: "Upload failed", description: err.error });
      }
    } catch {
      toastError({ title: "Upload failed" });
    }
    setUploading(false);
  }

  async function uploadFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) await uploadFile(f);
  }

  async function deleteAttachment(id: string, name: string) {
    const ok = await confirm({
      title: "Remove attachment?",
      description: `"${name}" will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/tasks/${taskId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId: id }),
    });
    fetchAttachments();
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Paperclip size={13} className="text-gray-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          Attachments
          {attachments.length > 0 && (
            <span className="ml-1.5 text-gray-400 font-normal">({attachments.length})</span>
          )}
        </h3>
        <label className="ml-auto flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors">
          {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
          {uploading ? "Uploading…" : "Upload"}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); }}
          />
        </label>
      </div>

      {/* Drop zone / list */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg transition-colors",
          dragOver && "ring-2 ring-[#99ff33] ring-offset-1 bg-[#99ff33]/5"
        )}
      >
        {loading ? (
          <div className="space-y-1">
            {[1, 2].map((i) => <div key={i} className="h-9 rounded-md bg-gray-100 animate-pulse" />)}
          </div>
        ) : attachments.length === 0 ? (
          <label className="block border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:border-[#99ff33]/60 hover:bg-[#99ff33]/5 cursor-pointer transition-all group">
            <Upload size={16} className="mx-auto mb-1.5 text-gray-400 group-hover:text-[#2d5200]" />
            <p className="text-xs text-gray-500 group-hover:text-gray-700">
              Drop files here or <span className="font-semibold underline">browse</span>
            </p>
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); }}
            />
          </label>
        ) : (
          <div className="space-y-1">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors"
              >
                <FileIconFor name={a.fileName} type={a.fileType} />
                <div className="flex-1 min-w-0">
                  <a
                    href={a.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-gray-800 hover:text-[#2d5200] truncate block"
                  >
                    {a.fileName}
                  </a>
                  <p className="text-[10px] text-gray-400">
                    {formatBytes(a.fileSize)}
                    {a.user?.name && ` · ${a.user.name}`}
                    {a.createdAt && ` · ${new Date(a.createdAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                  <a
                    href={a.filePath}
                    download={a.fileName}
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                    title="Download"
                  >
                    <Download size={12} />
                  </a>
                  <button
                    onClick={() => deleteAttachment(a.id, a.fileName)}
                    className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
