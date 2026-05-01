import { db } from "@/db";
import { forms, formSubmissions, projects, teamMembers } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const form = await db.query.forms.findFirst({ where: eq(forms.id, id) });
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  // Project member access check
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, form.projectId),
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.teamId) {
    const membership = await db.query.teamMembers.findFirst({
      where: and(
        eq(teamMembers.teamId, project.teamId),
        eq(teamMembers.userId, user.id)
      ),
    });
    if (!membership) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }
  } else if (project.ownerId !== user.id) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const submissions = await db.query.formSubmissions.findMany({
    where: eq(formSubmissions.formId, id),
    orderBy: (s, { desc }) => [desc(s.createdAt)],
  });

  return NextResponse.json({ submissions });
}
