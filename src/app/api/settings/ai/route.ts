// Read / set / clear the AI provider keys + model used by getModel().
// Values stored in `app_config` are encrypted (AES-256-GCM keyed off NEXTAUTH_SECRET).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  clearAnthropicKey,
  clearOpenAIKey,
  getAiKeysStatus,
  setAiModel,
  setAnthropicKey,
  setOpenAIKey,
} from "@/lib/app-config";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function GET() {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const status = await getAiKeysStatus();
  return NextResponse.json(status);
}

type PutBody = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  model?: string | null;
};

export async function PUT(req: Request) {
  if (!(await requireUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.openaiApiKey === "string") {
    const v = body.openaiApiKey.trim();
    if (v) await setOpenAIKey(v);
    else await clearOpenAIKey();
  }

  if (typeof body.anthropicApiKey === "string") {
    const v = body.anthropicApiKey.trim();
    if (v) await setAnthropicKey(v);
    else await clearAnthropicKey();
  }

  if (typeof body.model === "string") {
    const v = body.model.trim();
    if (v) await setAiModel(v);
  }

  return NextResponse.json(await getAiKeysStatus());
}
