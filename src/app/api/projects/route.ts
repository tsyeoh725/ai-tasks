import { db } from "@/db";
import { projects, teamMembers, sections, projectStatuses } from "@/db/schema";
import { eq, and, isNull, count, type SQL } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { parsePagination } from "@/lib/api";
import { getBuiltinTemplate } from "@/lib/project-templates";
import { resolveWorkspaceForUser } from "@/lib/workspace";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const { page, limit, offset } = parsePagination(searchParams);
  const ws = await resolveWorkspaceForUser(user.id);

  let where: SQL | undefined;
  if (ws.kind === "personal") {
    where = and(eq(projects.ownerId, user.id), isNull(projects.teamId));
  } else {
    where = eq(projects.teamId, ws.teamId);
  }

  const [result, [{ total }]] = await Promise.all([
    db.query.projects.findMany({
      where,
      orderBy: (p, { desc }) => [desc(p.updatedAt)],
      limit,
      offset,
    }),
    db.select({ total: count() }).from(projects).where(where),
  ]);

  return NextResponse.json({ projects: result, total, page, limit, hasMore: page * limit < total });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { name, description, color, icon, teamId, category, clientId, campaign, templateSlug } = await req.json();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // teamId from request body wins; otherwise default to whatever workspace
  // the user is currently in. Verify membership for any non-null target.
  const ws = await resolveWorkspaceForUser(user.id);
  const resolvedTeamId: string | null =
    teamId ?? (ws.kind === "team" ? ws.teamId : null);

  if (resolvedTeamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(eq(teamMembers.teamId, resolvedTeamId), eq(teamMembers.userId, user.id)),
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a team member" }, { status: 403 });
    }
  }

  const id = uuid();
  const now = new Date();

  await db.insert(projects).values({
    id,
    name,
    description: description || null,
    color: color || "#99ff33",
    icon: icon || null,
    category: category || null,
    clientId: clientId || null,
    campaign: campaign || null,
    teamId: resolvedTeamId,
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  });

  // Seed default statuses for this project
  const defaultStatuses = [
    { name: "To Do", color: "#94a3b8", sortOrder: 0, isDefault: true, isFinal: false },
    { name: "In Progress", color: "#3b82f6", sortOrder: 1, isDefault: false, isFinal: false },
    { name: "In Review", color: "#f59e0b", sortOrder: 2, isDefault: false, isFinal: false },
    { name: "Done", color: "#22c55e", sortOrder: 3, isDefault: false, isFinal: true },
  ];
  await db.insert(projectStatuses).values(
    defaultStatuses.map((s) => ({ ...s, id: uuid(), projectId: id, createdAt: now }))
  );

  // Apply template if requested
  if (templateSlug) {
    const tmpl = getBuiltinTemplate(templateSlug);
    if (tmpl?.sections) {
      await db.insert(sections).values(
        tmpl.sections.map((s: { name: string; sortOrder: number }) => ({
          id: uuid(),
          projectId: id,
          name: s.name,
          sortOrder: s.sortOrder,
          createdAt: now,
        }))
      );
    }
  }

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  return NextResponse.json(project, { status: 201 });
}
