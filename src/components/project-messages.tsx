"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";

type Author = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type Message = {
  id: string;
  projectId: string;
  authorId: string;
  title: string | null;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: Author;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ProjectMessages({ projectId }: { projectId: string }) {
  const { data: session } = useSession();
  const confirm = useConfirm();
  const currentUserId = session?.user?.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  async function createMessage() {
    if (!newContent.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle || undefined, content: newContent }),
      });
      setNewTitle("");
      setNewContent("");
      setComposing(false);
      await fetchMessages();
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(id: string) {
    setSubmitting(true);
    try {
      await fetch(`/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, content: editContent }),
      });
      setEditingId(null);
      await fetchMessages();
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePin(id: string, pinned: boolean) {
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !pinned }),
    });
    await fetchMessages();
  }

  async function deleteMessage(id: string) {
    const ok = await confirm({
      title: "Delete message?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
    await fetchMessages();
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Messages</h2>
        {!composing && (
          <Button onClick={() => setComposing(true)} size="sm">
            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New message
          </Button>
        )}
      </div>

      {composing && (
        <div className="border rounded-lg p-4 mb-4 bg-card">
          <Input
            placeholder="Title (optional)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="mb-2"
          />
          <Textarea
            placeholder="Write your message..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={6}
            className="mb-3"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setComposing(false);
                setNewTitle("");
                setNewContent("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={createMessage} disabled={submitting || !newContent.trim()}>
              {submitting ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No messages yet. Start the conversation!
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const isOwner = m.authorId === currentUserId;
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className={cn("border rounded-lg p-4 bg-card", m.pinned && "border-primary/40 bg-primary/5")}>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium flex-shrink-0">
                    {m.author.name[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{m.author.name}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span>
                      {m.pinned && (
                        <span className="text-[10px] uppercase tracking-wider text-primary font-semibold">
                          Pinned
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div>
                        <Input
                          placeholder="Title (optional)"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="mb-2"
                        />
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={5}
                          className="mb-2"
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(m.id)} disabled={submitting}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.title && <h3 className="font-medium text-sm mb-1">{m.title}</h3>}
                        <div className="text-sm whitespace-pre-wrap break-words text-foreground/90">
                          {m.content}
                        </div>
                      </>
                    )}
                  </div>
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => togglePin(m.id, m.pinned)}
                        title={m.pinned ? "Unpin" : "Pin"}
                      >
                        <svg className="h-4 w-4" fill={m.pinned ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5l14 14M12 3v2m-5 9h10l-2-8H9l-2 8zm4 0v7" />
                        </svg>
                      </Button>
                      {isOwner && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditingId(m.id);
                              setEditTitle(m.title || "");
                              setEditContent(m.content);
                            }}
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteMessage(m.id)}
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
                            </svg>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
