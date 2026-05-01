"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Comment = {
  id: string;
  content: string;
  isAi: boolean;
  createdAt: string;
  author?: { name: string } | null;
};

type Props = {
  taskId: string;
  comments: Comment[];
  onNewMessage: () => void;
};

export function AiChat({ taskId, comments, onNewMessage }: Props) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments, streamingResponse]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || sending) return;

    const userMessage = message.trim();
    setMessage("");
    setSending(true);
    setStreamingResponse("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, message: userMessage }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStreamingResponse(`Error: ${err.error || "Failed to get response"}`);
        setSending(false);
        onNewMessage();
        return;
      }

      if (!res.body) {
        setSending(false);
        onNewMessage();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        accumulated += chunk;
        setStreamingResponse(accumulated);
      }

      setStreamingResponse("");
      onNewMessage();
    } catch {
      setStreamingResponse("Error: Failed to connect");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h3 className="font-medium flex items-center gap-2">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI Assistant
        </h3>
        <p className="text-xs text-muted-foreground">Discuss this task with AI</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {comments.length === 0 && !streamingResponse && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>Ask AI about this task.</p>
            <p className="mt-1 text-xs">Try: &quot;How should I approach this?&quot;</p>
          </div>
        )}

        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`flex ${comment.isAi ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                comment.isAi
                  ? "bg-muted"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {comment.isAi && (
                <p className="text-xs font-medium text-primary mb-1">AI</p>
              )}
              <p className="whitespace-pre-wrap">{comment.content}</p>
            </div>
          </div>
        ))}

        {streamingResponse && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
              <p className="text-xs font-medium text-primary mb-1">AI</p>
              <p className="whitespace-pre-wrap">{streamingResponse}</p>
              <span className="inline-block w-2 h-4 bg-primary/50 animate-pulse ml-0.5" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-3 border-t flex gap-2">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ask AI about this task..."
          disabled={sending}
        />
        <Button type="submit" size="sm" disabled={sending || !message.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
