import { db } from "@/db";
import {
  bundles,
  projects,
  teamMembers,
  sections,
  customFieldDefinitions,
  automationRules,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

type BundleManifest = {
  rules?: Array<{
    name: string;
    description?: string | null;
    trigger: unknown;
    actions: unknown;
    enabled?: boolean;
  }>;
  customFields?: Array<{
    name: string;
    type: "text" | "number" | "date" | "select" | "multi_select";
    options?: unknown;
    required?: boolean;
    position?: number;
  }>;
  sections?: Array<{ name: string; sortOrder?: number }>;
  views?: unknown;
};

// POST { projectId } — apply manifest to project
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const body = await req.json();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 }
    );
  }

  const bundle = await db.query.bundles.findFirst({
    where: eq(bundles.id, id),
  });
  if (!bundle) {
    return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
  }

  // Verify project access
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
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
      return NextResponse.json(
        { error: "No access to project" },
        { status: 403 }
      );
    }
  } else if (project.ownerId !== user.id) {
    return NextResponse.json(
      { error: "No access to project" },
      { status: 403 }
    );
  }

  let manifest: BundleManifest;
  try {
    manifest =
      typeof bundle.manifest === "string"
        ? JSON.parse(bundle.manifest)
        : (bundle.manifest as unknown as BundleManifest);
  } catch {
    return NextResponse.json(
      { error: "Bundle manifest is malformed" },
      { status: 400 }
    );
  }

  const now = new Date();
  const created = {
    sections: 0,
    customFields: 0,
    rules: 0,
  };

  // Sections
  if (Array.isArray(manifest.sections)) {
    const existing = await db.query.sections.findMany({
      where: eq(sections.projectId, projectId),
    });
    let base = existing.length;
    for (const s of manifest.sections) {
      await db.insert(sections).values({
        id: uuid(),
        projectId,
        name: s.name,
        sortOrder: s.sortOrder ?? base++,
        createdAt: now,
      });
      created.sections++;
    }
  }

  // Custom fields
  if (Array.isArray(manifest.customFields)) {
    const existing = await db.query.customFieldDefinitions.findMany({
      where: eq(customFieldDefinitions.projectId, projectId),
    });
    let base = existing.length;
    for (const f of manifest.customFields) {
      await db.insert(customFieldDefinitions).values({
        id: uuid(),
        projectId,
        name: f.name,
        type: f.type,
        options: f.options ? JSON.stringify(f.options) : null,
        required: f.required ?? false,
        position: f.position ?? base++,
        createdAt: now,
      });
      created.customFields++;
    }
  }

  // Automation rules
  if (Array.isArray(manifest.rules)) {
    for (const r of manifest.rules) {
      await db.insert(automationRules).values({
        id: uuid(),
        projectId,
        name: r.name,
        description: r.description || null,
        trigger:
          typeof r.trigger === "string" ? r.trigger : JSON.stringify(r.trigger),
        actions:
          typeof r.actions === "string" ? r.actions : JSON.stringify(r.actions),
        enabled: r.enabled ?? true,
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
      });
      created.rules++;
    }
  }

  return NextResponse.json({ success: true, created });
}
