import { db } from "@/db";
import {
  forms,
  formFields,
  formSubmissions,
  tasks,
  customFieldValues,
  customFieldDefinitions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

// POST — PUBLIC; no auth required if form.isPublic = true
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const form = await db.query.forms.findFirst({
    where: eq(forms.id, id),
    with: {
      fields: { orderBy: (ff, { asc }) => [asc(ff.position)] },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  if (!form.isPublic) {
    return NextResponse.json(
      { error: "Form is not public" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { data, submitterName, submitterEmail } = body;

  if (!data || typeof data !== "object") {
    return NextResponse.json(
      { error: "data object is required" },
      { status: 400 }
    );
  }

  // Validate required fields
  for (const field of form.fields) {
    if (field.required) {
      const value = (data as Record<string, unknown>)[field.id];
      if (value === undefined || value === null || value === "") {
        return NextResponse.json(
          { error: `Field "${field.label}" is required` },
          { status: 400 }
        );
      }
    }
  }

  // Build task from mapped fields
  let title = "Form submission";
  let description: string | null = null;
  let priority: "low" | "medium" | "high" | "urgent" = "medium";
  let dueDate: Date | null = null;
  const customFieldMappings: { fieldId: string; value: string }[] = [];

  for (const field of form.fields) {
    const value = (data as Record<string, unknown>)[field.id];
    if (value === undefined || value === null || value === "") continue;
    const strValue = String(value);

    switch (field.mapsTo) {
      case "title":
        title = strValue;
        break;
      case "description":
        description = strValue;
        break;
      case "priority":
        if (["low", "medium", "high", "urgent"].includes(strValue)) {
          priority = strValue as "low" | "medium" | "high" | "urgent";
        }
        break;
      case "dueDate":
        try {
          const d = new Date(strValue);
          if (!isNaN(d.getTime())) dueDate = d;
        } catch {
          // ignore parse errors
        }
        break;
      default:
        if (field.mapsTo) {
          // Check if this mapsTo is a custom field id
          const customField = await db.query.customFieldDefinitions.findFirst({
            where: eq(customFieldDefinitions.id, field.mapsTo),
          });
          if (customField && customField.projectId === form.projectId) {
            customFieldMappings.push({
              fieldId: customField.id,
              value: strValue,
            });
          }
        }
        break;
    }
  }

  const now = new Date();
  const taskId = uuid();

  await db.insert(tasks).values({
    id: taskId,
    title,
    description,
    status: "todo",
    priority,
    projectId: form.projectId,
    createdById: form.createdById, // attribute to form owner
    assigneeId: null,
    dueDate,
    createdAt: now,
    updatedAt: now,
  });

  // Insert custom field values
  for (const cf of customFieldMappings) {
    await db.insert(customFieldValues).values({
      id: uuid(),
      taskId,
      fieldId: cf.fieldId,
      value: cf.value,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Record submission
  const submissionId = uuid();
  await db.insert(formSubmissions).values({
    id: submissionId,
    formId: id,
    data: JSON.stringify(data),
    createdTaskId: taskId,
    submitterName: submitterName || null,
    submitterEmail: submitterEmail || null,
    createdAt: now,
  });

  return NextResponse.json({ success: true, taskId });
}
