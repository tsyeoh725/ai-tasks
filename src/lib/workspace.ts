// Active workspace = "personal" | <teamId>. Persisted in a cookie so every
// fetch (server-rendered or client) carries it without having to thread the
// value through every fetch call site.
//
// Server: import { activeWorkspace } from "@/lib/workspace" inside a route
// handler.
// Client: import { useWorkspace } from "@/components/workspace-context".
import { cookies } from "next/headers";
import { db } from "@/db";
import { teamMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const WORKSPACE_COOKIE = "aitasks_workspace";
export type Workspace = { kind: "personal" } | { kind: "team"; teamId: string };

export function parseWorkspace(value: string | undefined | null): Workspace {
  if (!value || value === "personal") return { kind: "personal" };
  return { kind: "team", teamId: value };
}

/** Read the workspace from the request cookie. Defaults to personal. */
export async function activeWorkspace(): Promise<Workspace> {
  const c = await cookies();
  return parseWorkspace(c.get(WORKSPACE_COOKIE)?.value);
}

/**
 * Resolve the workspace for a request, *and* enforce that the requesting user
 * actually belongs to it (so a tampered cookie can't pull data from someone
 * else's team). Falls back to personal for unknown / non-member team ids.
 */
export async function resolveWorkspaceForUser(userId: string): Promise<Workspace> {
  const ws = await activeWorkspace();
  if (ws.kind === "personal") return ws;
  const membership = await db.query.teamMembers.findFirst({
    where: and(eq(teamMembers.teamId, ws.teamId), eq(teamMembers.userId, userId)),
  });
  return membership ? ws : { kind: "personal" };
}
