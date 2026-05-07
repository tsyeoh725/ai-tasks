"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { AiCommand } from "@/components/ai-command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getTeammate } from "@/lib/ai-teammates";

type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

function AiPageInner() {
  const searchParams = useSearchParams();
  const teammateId = searchParams.get("teammate") || undefined;
  const teammate = teammateId ? getTeammate(teammateId) : undefined;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    loadConversations();
  }, [loadConversations]);

  function handleNewChat() {
    setActiveConvId(undefined);
  }

  function handleConversationCreated(id: string) {
    loadConversations();
    setActiveConvId(id);
  }

  async function handleDeleteConversation(id: string) {
    try {
      await fetch("/api/ai/conversations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id }),
      });
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConvId === id) setActiveConvId(undefined);
    } catch {}
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col border-r bg-card transition-all duration-200",
          sidebarOpen ? "w-64" : "w-0 overflow-hidden"
        )}
      >
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversations</h2>
          <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-7 px-2">
            <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {conversations.map(conv => (
              <div key={conv.id} className="group relative">
                <button
                  onClick={() => setActiveConvId(conv.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                    activeConvId === conv.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                  type="button"
                  // F-67: native tooltip on truncated conversation titles so
                  // the full title is reachable on hover.
                  title={conv.title}
                >
                  <p className="truncate font-medium">{conv.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(conv.updatedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                  type="button"
                >
                  <svg className="h-3.5 w-3.5 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">
                No conversations yet. Start chatting!
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Toggle sidebar */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="flex items-center justify-center w-6 border-r hover:bg-accent transition-colors"
        type="button"
      >
        <svg
          className={cn("h-4 w-4 text-muted-foreground transition-transform", !sidebarOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b px-4 py-2 flex items-center gap-2">
          {teammate ? (
            <>
              <span className="text-xl leading-none" aria-hidden>{teammate.emoji}</span>
              <h1 className="font-semibold">{teammate.name}</h1>
              <span className="text-xs text-muted-foreground">{teammate.role}</span>
            </>
          ) : (
            <>
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
              <h1 className="font-semibold">AI Command Center</h1>
            </>
          )}
        </div>
        <AiCommand
          key={`${teammateId || "none"}-${activeConvId || "new"}`}
          conversationId={activeConvId}
          teammateId={teammateId}
          onConversationCreated={handleConversationCreated}
          className="flex-1"
        />
      </div>
    </div>
  );
}

export default function AiPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <AiPageInner />
    </Suspense>
  );
}
