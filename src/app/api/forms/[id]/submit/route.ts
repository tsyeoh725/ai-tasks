// SL-5: public form submit — rate-limited per (formId, ip) and per formId
// globally. Body capped at 1 MB. Field count bounded relative to the form's
// declared fields. Without these, anyone could flood a public form with
// millions of tasks under the form owner's account.

import { db } from "@/db";
import {
  forms,
  formSubmissions,
  tasks,
  customFieldValues,
  customFieldDefinitions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const SUBMIT_WINDOW_MS = 60 * 1000;     // 1 minute
const SUBMIT_MAX_PER_IP_PER_MIN = 10;
const SUBMIT_DAY_MS = 24 * 60 * 60 * 1000;
const SUBMIT_MAX_PER_FORM_PER_DAY = 1000;
const MAX_BODY_BYTES = 1 * 1024 * 1024;   // 1 MB cap on submission body

// POST — PUBLIC; no auth required if form.isPublic = true
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // SL-5: cap body size. Reading via .text() and parsing manually so we can
  // measure bytes instead of trusting Content-Length (which can lie).
  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Submission too large" }, { status: 413 });
  }

  const ip = getClientIp(req);
  const perIp = rateLimit(`submit:${id}:${ip}`, SUBMIT_WINDOW_MS, SUBMIT_MAX_PER_IP_PER_MIN);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "Too many submissions, slow down." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(perIp.retryAfterMs / 1000)) },
      },
    );
  }
  const perForm = rateLimit(`submit:${id}`, SUBMIT_DAY_MS, SUBMIT_MAX_PER_FORM_PER_DAY);
  if (!perForm.allowed) {
    return NextResponse.json(
      { error: "This form has hit its daily submission cap." },
      { status: 429 },
    );
  }

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

  let body: { data?: unknown; submitterName?: unknown; submitterEmail?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { data } = body;
  const submitterName = typeof body.submitterName === "string" ? body.submitterName : null;
  const submitterEmail = typeof body.submitterEmail === "string" ? body.submitterEmail : null;

  if (!data || typeof data !== "object") {
    return NextResponse.json(
      { error: "data object is required" },
      { status: 400 }
    );
  }

  // SL-5: bound the data object's key count to 2x the form's declared
  // fields. Stops a 1000-field POST from amplifying DB load via the
  // customFieldDefinitions.findFirst loop below.
  const dataKeys = Object.keys(data as Record<string, unknown>);
  if (dataKeys.length > Math.max(20, form.fields.length * 2)) {
    return NextResponse.json(
      { error: "Too many fields in submission" },
      { status: 400 },
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
