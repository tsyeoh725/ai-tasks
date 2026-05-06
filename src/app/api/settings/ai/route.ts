// Read / set / clear the AI provider keys + model used by Jarvis and Audit.
// Values stored in `app_config` are encrypted (AES-256-GCM keyed off NEXTAUTH_SECRET).
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  clearAuditAnthropicKey,
  clearJarvisOpenAIKey,
  getAiKeysStatus,
  setAiModel,
  setAuditAnthropicKey,
  setJarvisOpenAIKey,
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
  jarvisOpenaiKey?: string;
  auditAnthropicKey?: string;
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

  if (typeof body.jarvisOpenaiKey === "string") {
    const v = body.jarvisOpenaiKey.trim();
    if (v) await setJarvisOpenAIKey(v);
    else await clearJarvisOpenAIKey();
  }

  if (typeof body.auditAnthropicKey === "string") {
    const v = body.auditAnthropicKey.trim();
    if (v) await setAuditAnthropicKey(v);
    else await clearAuditAnthropicKey();
  }

  if (typeof body.model === "string") {
    const v = body.model.trim();
    if (v) await setAiModel(v);
  }

  return NextResponse.json(await getAiKeysStatus());
}
