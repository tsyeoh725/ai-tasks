import { db } from "@/db";
import { teamWorkspace, teamMembers, users, tasks } from "@/db/schema";
import { eq, and, or, isNull, inArray, count } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// GET — list all team members + their workspace positions + their open task counts
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const teamId = searchParams.get("teamId");

  // Resolve set of users: current user + their team members
  const userTeams = await db.query.teamMembers.findMany({
    where: eq(teamMembers.userId, user.id!),
    columns: { teamId: true },
  });
  const myTeamIds = userTeams.map((t) => t.teamId);

  let memberIds: string[] = [user.id!];
  if (teamId) {
    if (!myTeamIds.includes(teamId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const teamMembs = await db.query.teamMembers.findMany({
      where: eq(teamMembers.teamId, teamId),
      columns: { userId: true },
    });
    memberIds = teamMembs.map((m) => m.userId);
  } else if (myTeamIds.length > 0) {
    // Aggregate all team members across all teams the user belongs to
    const teamMembs = await db.query.teamMembers.findMany({
      where: inArray(teamMembers.teamId, myTeamIds),
      columns: { userId: true },
    });
    memberIds = Array.from(new Set([user.id!, ...teamMembs.map((m) => m.userId)]));
  }

  if (memberIds.length === 0) return NextResponse.json({ members: [] });

  // Load user records
  const userRecs = await db.query.users.findMany({
    where: inArray(users.id, memberIds),
    columns: { id: true, name: true, email: true },
  });

  // Existing workspace positions
  const positions = await db.query.teamWorkspace.findMany({
    where: inArray(teamWorkspace.userId, memberIds),
  });
  const posMap = new Map(positions.map((p) => [p.userId, p]));

  // Open task counts per user
  const taskCounts = await db
    .select({ assigneeId: tasks.assigneeId, c: count() })
    .from(tasks)
    .where(and(inArray(tasks.assigneeId, memberIds), or(eq(tasks.status, "todo"), eq(tasks.status, "in_progress"), eq(tasks.status, "blocked"))!))
    .groupBy(tasks.assigneeId);
  const taskMap = new Map(taskCounts.map((t) => [t.assigneeId, t.c]));

  // For users without a position record, generate a default position
  const members = userRecs.map((u, idx) => {
    const existing = posMap.get(u.id);
    const cols = 12;
    return {
      userId: u.id,
      name: u.name || u.email || "Member",
      email: u.email,
      character: existing?.character ?? "dev_1",
      characterColor: existing?.characterColor ?? "#99ff33",
      x: existing?.x ?? (3 + (idx % cols)),
      y: existing?.y ?? (3 + Math.floor(idx / cols) * 3),
      statusEmoji: existing?.statusEmoji ?? "💻",
      statusText: existing?.statusText ?? null,
      isOnline: existing?.isOnline ?? true,
      openTasks: taskMap.get(u.id) ?? 0,
      isMe: u.id === user.id,
    };
  });

  return NextResponse.json({ members });
}

// PATCH — update my own workspace position / character / status
export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  let body: Record<string, any>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const existing = await db.query.teamWorkspace.findFirst({
    where: eq(teamWorkspace.userId, user.id!),
  });

  const now = new Date();
  if (!existing) {
    await db.insert(teamWorkspace).values({
      id: uuid(),
      userId: user.id!,
      character: body.character ?? "dev_1",
      characterColor: body.characterColor ?? "#99ff33",
      x: typeof body.x === "number" ? body.x : 5,
      y: typeof body.y === "number" ? body.y : 5,
      statusEmoji: body.statusEmoji ?? "💻",
      statusText: body.statusText ?? null,
      isOnline: body.isOnline ?? true,
      updatedAt: now,
    });
  } else {
    const updates: Record<string, unknown> = { updatedAt: now };
    ["character", "characterColor", "statusEmoji", "statusText"].forEach((k) => {
      if (body[k] !== undefined) updates[k] = body[k];
    });
    if (typeof body.x === "number") updates.x = body.x;
    if (typeof body.y === "number") updates.y = body.y;
    if (body.isOnline !== undefined) updates.isOnline = !!body.isOnline;
    await db.update(teamWorkspace).set(updates).where(eq(teamWorkspace.userId, user.id!));
  }

  return NextResponse.json({ ok: true });
}
