import { db } from "@/db";
import { subtasks } from "@/db/schema";
import { getSessionUser, unauthorized } from "@/lib/session";
import { NextResponse } from "next/server";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { taskId, title } = await req.json();

  if (!taskId || !title) {
    return NextResponse.json({ error: "taskId and title required" }, { status: 400 });
  }

  const id = uuid();
  await db.insert(subtasks).values({ id, taskId, title });

  return NextResponse.json({ id, taskId, title, isDone: false }, { status: 201 });
}
