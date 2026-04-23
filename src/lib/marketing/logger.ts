import { db } from "@/db";
// NOTE: `marketingAuditLog` is expected to be added to the Drizzle schema by
// the parallel schema task. Shape (Jarvis-standard column names, camelCase):
//   id, eventType, entityType, entityId, payload (JSON text), createdAt.
// If the import fails at typecheck time, that task has not landed yet.
import { marketingAuditLog } from "@/db/schema";
import { v4 as uuid } from "uuid";

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogSource =
  | "meta_api"
  | "ai_guard"
  | "action_executor"
  | "monitor"
  | "telegram"
  | "sync"
  | "system"
  | "learning"
  | "task_generator";

interface LogEntry {
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: Record<string, unknown>;
}

// In-memory buffer for current request (flushed to DB at end)
let buffer: Array<LogEntry & { timestamp: string }> = [];

function writeConsole(level: LogLevel, source: LogSource, message: string, details?: Record<string, unknown>) {
  const prefix = `[${source.toUpperCase()}]`;
  const detailsStr = details ? JSON.stringify(details, null, 2) : "";
  if (level === "error") {
    console.error(prefix, message, detailsStr);
  } else if (level === "warn") {
    console.warn(prefix, message, detailsStr);
  } else {
    console.log(prefix, message, detailsStr);
  }
}

export function log(
  level: LogLevel,
  source: LogSource,
  message: string,
  details?: Record<string, unknown>,
) {
  const entry = {
    level,
    source,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
  buffer.push(entry);
  writeConsole(level, source, message, details);
}

// Structured logger wrapper expected by the task spec (logger.info / .error / .flush)
export const logger = {
  info(event: string, payload?: Record<string, unknown>) {
    log("info", inferSource(event), event, payload);
  },
  warn(event: string, payload?: Record<string, unknown>) {
    log("warn", inferSource(event), event, payload);
  },
  error(event: string, payload?: Record<string, unknown>) {
    log("error", inferSource(event), event, payload);
  },
  debug(event: string, payload?: Record<string, unknown>) {
    log("debug", inferSource(event), event, payload);
  },
  async flush(sessionId?: string, userId?: string) {
    return flushLogs(sessionId, userId);
  },
};

// Best-effort source inference from dotted event name like "meta_api.request"
function inferSource(event: string): LogSource {
  const head = event.split(/[.:]/)[0];
  const valid: LogSource[] = [
    "meta_api",
    "ai_guard",
    "action_executor",
    "monitor",
    "telegram",
    "sync",
    "system",
    "learning",
    "task_generator",
  ];
  return (valid as string[]).includes(head) ? (head as LogSource) : "system";
}

export async function flushLogs(sessionLabel?: string, userId?: string) {
  if (buffer.length === 0) return;

  const logsToFlush = [...buffer];
  buffer = [];

  // marketingAuditLog requires a userId FK. If the caller didn't provide one,
  // we can't persist; drop the logs (still printed to console) rather than crash.
  if (!userId) return;

  try {
    await db.insert(marketingAuditLog).values({
      id: uuid(),
      userId,
      sessionId: sessionLabel || null,
      eventType: "system_log",
      entityType: "session",
      entityId: sessionLabel || "unknown",
      payload: JSON.stringify({ logs: logsToFlush }),
      createdAt: new Date(),
    });
  } catch (err) {
    // Don't fail the caller just because we couldn't flush logs.
    console.error("[LOGGER] Failed to flush logs:", err);
  }
}

export function getBufferedLogs() {
  return [...buffer];
}

export function clearBuffer() {
  buffer = [];
}
