import { db } from "@/db";
import { tasks, taskComments, projectBriefs, documents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser, unauthorized } from "@/lib/session";
import { streamAiResponse } from "@/lib/ai";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const { taskId, message } = await req.json();

  if (!taskId || !message) {
    return new Response(JSON.stringify({ error: "taskId and message required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get task with context
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: {
      project: true,
      subtasks: true,
      assignee: { columns: { name: true } },
    },
  });

  if (!task) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get project brief and documents for context
  const brief = await db.query.projectBriefs.findFirst({
    where: eq(projectBriefs.projectId, task.projectId),
  });

  const projectDocs = await db.query.documents.findMany({
    where: eq(documents.projectId, task.projectId),
    columns: { filename: true, extractedText: true },
  });

  // Get recent chat history
  const history = await db.query.taskComments.findMany({
    where: eq(taskComments.taskId, taskId),
    orderBy: (c, { desc }) => [desc(c.createdAt)],
    limit: 20,
  });
  const chatHistory = history.reverse();

  // Save user message
  await db.insert(taskComments).values({
    id: uuid(),
    taskId,
    content: message,
    authorId: user.id,
    isAi: false,
  });

  // Build system prompt with context
  let systemPrompt = `You are an AI task assistant. You help users plan, discuss, and work through their tasks.

Current task context:
- Title: ${task.title}
- Description: ${task.description || "No description"}
- Status: ${task.status}
- Priority: ${task.priority}
- Due date: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "Not set"}
- Project: ${task.project.name}
- Assignee: ${task.assignee?.name || "Unassigned"}
- Subtasks: ${task.subtasks.length > 0 ? task.subtasks.map((s) => `${s.isDone ? "[x]" : "[ ]"} ${s.title}`).join(", ") : "None"}`;

  if (brief?.content && brief.content !== "{}") {
    systemPrompt += `\n\nProject Brief:\n${brief.content}`;
  }

  if (projectDocs.length > 0) {
    const docContext = projectDocs
      .filter((d) => d.extractedText)
      .map((d) => `--- ${d.filename} ---\n${d.extractedText?.substring(0, 2000)}`)
      .join("\n\n");
    if (docContext) {
      systemPrompt += `\n\nProject Documents:\n${docContext}`;
    }
  }

  if (chatHistory.length > 0) {
    systemPrompt += `\n\nRecent conversation:\n${chatHistory.map((c) => `${c.isAi ? "AI" : "User"}: ${c.content}`).join("\n")}`;
  }

  systemPrompt += `\n\nBe concise, helpful, and actionable. If the user asks you to break down the task, suggest specific subtasks. If they ask for advice, give practical recommendations.`;

  try {
    const result = await streamAiResponse(systemPrompt, message);

    // Create a streaming response
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            fullResponse += chunk;
            controller.enqueue(encoder.encode(chunk));
          }

          // Save AI response after stream completes
          await db.insert(taskComments).values({
            id: uuid(),
            taskId,
            content: fullResponse,
            authorId: null,
            isAi: true,
          });

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "AI service error";
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
