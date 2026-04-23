"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  conversationId?: string;
  teammateId?: string;
  onConversationCreated?: (id: string) => void;
  className?: string;
  compact?: boolean;
};

export function AiCommand({ conversationId, teammateId, onConversationCreated, className, compact }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const createdRef = useRef(false);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: "/api/ai/command",
      body: teammateId ? { teammate: teammateId } : undefined,
    }),
    [teammateId]
  );

  const { messages, sendMessage, setMessages, status } = useChat({
    ...(conversationId ? { id: conversationId } : {}),
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Load existing messages when conversationId changes
  useEffect(() => {
    createdRef.current = false;
    if (conversationId) {
      fetch(`/api/ai/conversations/${conversationId}`)
        .then(r => r.json())
        .then(data => {
          if (data.messages) {
            setMessages(
              data.messages
                .filter((m: any) => m.role === "user" || m.role === "assistant")
                .map((m: any) => ({
                  id: m.id,
                  role: m.role,
                  content: m.content,
                  parts: [{ type: "text" as const, text: m.content }],
                }))
            );
          }
        })
        .catch(() => {});
    } else {
      setMessages([]);
    }
  }, [conversationId, setMessages]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Detect when a conversation was created (first assistant response)
  useEffect(() => {
    if (!conversationId && !createdRef.current && messages.length >= 2) {
      const hasAssistant = messages.some(m => m.role === "assistant");
      if (hasAssistant) {
        createdRef.current = true;
        // The chat ID is the conversation ID
        const chatId = messages[0]?.id?.split("-").slice(0, 5).join("-");
        // We notify parent - parent can reload conversations list
        onConversationCreated?.("");
      }
    }
  }, [messages, conversationId, onConversationCreated]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    await sendMessage({ text });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-4">
              <svg className="h-12 w-12 text-primary/30 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
              </svg>
            </div>
            <h3 className={cn("font-semibold text-foreground", compact ? "text-base" : "text-lg")}>
              AI Command Center
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              I can manage your tasks, projects, and teams. Try:
            </p>
            <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <p>&ldquo;Show me all overdue tasks&rdquo;</p>
              <p>&ldquo;Create a task in Project X&rdquo;</p>
              <p>&ldquo;What&apos;s the status of my projects?&rdquo;</p>
              <p>&ldquo;Message John on Telegram about the deadline&rdquo;</p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "rounded-lg px-4 py-2.5 max-w-[85%] text-sm",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {message.role === "assistant" ? (
                <div className="space-y-2">
                  {message.parts?.map((part: any, i: number) => {
                    if (part.type === "text" && part.text) {
                      return (
                        <div key={i} className="whitespace-pre-wrap leading-relaxed">
                          {part.text}
                        </div>
                      );
                    }
                    // Tool parts have type "tool-<name>" in v6
                    if (part.type?.startsWith("tool-") || part.type === "dynamic-tool") {
                      const toolName = part.type === "dynamic-tool"
                        ? part.toolName
                        : part.type.replace("tool-", "");
                      return (
                        <ToolCallDisplay
                          key={i}
                          toolName={toolName}
                          state={part.state}
                          result={part.output}
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              ) : (
                <p className="whitespace-pre-wrap">
                  {message.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || ""}
                </p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Tell me what to do..."
            rows={1}
            className={cn(
              "flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              "max-h-32"
            )}
            style={{ minHeight: "40px" }}
          />
          <Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="self-end">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </Button>
        </form>
      </div>
    </div>
  );
}

function ToolCallDisplay({ toolName, state, result }: { toolName: string; state: string; result: any }) {
  const [expanded, setExpanded] = useState(false);

  const toolLabels: Record<string, string> = {
    createTask: "Creating task",
    updateTask: "Updating task",
    deleteTask: "Deleting task",
    listTasks: "Listing tasks",
    getTaskDetails: "Getting task details",
    createProject: "Creating project",
    listProjects: "Listing projects",
    createTeam: "Creating team",
    inviteTeamMember: "Inviting member",
    queryOverdueTasks: "Checking overdue tasks",
    queryTaskStats: "Getting statistics",
    sendTelegramNotification: "Sending Telegram message",
    searchUsers: "Searching users",
  };

  const label = toolLabels[toolName] || toolName;
  const isDone = state === "output-available" || state === "error";
  const isError = state === "error" || (isDone && result?.error);

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-2 text-xs py-1 px-2 rounded-md w-full text-left transition-colors",
          "bg-background/50 hover:bg-background/80 border",
          isError ? "border-red-500/30" : "border-border"
        )}
        type="button"
      >
        {isDone ? (
          isError ? (
            <svg className="h-3.5 w-3.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )
        ) : (
          <svg className="h-3.5 w-3.5 text-primary animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )}
        <span className="flex-1 font-medium">{label}</span>
        <svg className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && isDone && (
        <pre className="mt-1 p-2 rounded text-xs bg-background/50 border overflow-x-auto max-h-32">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
