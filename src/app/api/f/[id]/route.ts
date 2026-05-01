import { db } from "@/db";
import { forms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// Public read of a form — only returns minimal data needed to render
// the public submission UI, and only when isPublic = true.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const form = await db.query.forms.findFirst({
    where: eq(forms.id, id),
    with: {
      fields: { orderBy: (ff, { asc }) => [asc(ff.position)] },
    },
  });

  if (!form || !form.isPublic) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: form.id,
    title: form.title,
    description: form.description,
    isPublic: form.isPublic,
    fields: form.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      required: f.required,
      options: f.options,
      mapsTo: f.mapsTo,
      position: f.position,
    })),
  });
}
