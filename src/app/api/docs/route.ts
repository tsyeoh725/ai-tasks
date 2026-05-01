import { NextResponse } from "next/server";

const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "AI Tasks API",
    version: "1.0.0",
    description: "AI-powered task management API",
  },
  servers: [
    { url: "/api/v1", description: "API v1" },
  ],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "API key generated from Settings page",
      },
    },
    schemas: {
      Task: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          status: { type: "string", enum: ["todo", "in_progress", "done", "blocked"] },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          projectId: { type: "string" },
          assigneeId: { type: "string", nullable: true },
          dueDate: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          color: { type: "string" },
          teamId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/tasks": {
      get: {
        summary: "List tasks",
        parameters: [
          { name: "project_id", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string", enum: ["todo", "in_progress", "done", "blocked"] } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
        ],
        responses: { "200": { description: "List of tasks" } },
      },
      post: {
        summary: "Create a task",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "project_id"],
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string", enum: ["todo", "in_progress", "done", "blocked"] },
                  priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                  project_id: { type: "string" },
                  assignee_id: { type: "string" },
                  due_date: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Task created" } },
      },
    },
    "/tasks/{id}": {
      get: {
        summary: "Get a task",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Task details" } },
      },
      patch: {
        summary: "Update a task",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  status: { type: "string" },
                  priority: { type: "string" },
                  assignee_id: { type: "string" },
                  due_date: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Task updated" } },
      },
      delete: {
        summary: "Delete a task",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Task deleted" } },
      },
    },
    "/projects": {
      get: {
        summary: "List projects",
        responses: { "200": { description: "List of projects" } },
      },
      post: {
        summary: "Create a project",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  color: { type: "string" },
                  team_id: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Project created" } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiSpec);
}
