import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============ USERS ============
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TEAMS ============
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const teamMembers = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull().default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ CLIENTS ============
export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  brief: text("brief"), // rich-text brief / intro / context
  brandColor: text("brand_color").default("#99ff33"),
  // Contact
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  whatsapp: text("whatsapp"),
  website: text("website"),
  // Business
  industry: text("industry"),
  billingAddress: text("billing_address"),
  taxId: text("tax_id"),
  currency: text("currency").default("USD"),
  // Status
  status: text("status", { enum: ["active", "onboarding", "paused", "archived"] }).notNull().default("active"),
  // Service categories — JSON array, e.g. ["seo","social_media","performance"]
  services: text("services").default("[]"),
  // Flexible extras
  customFields: text("custom_fields").default("{}"), // JSON blob for highly customizable fields
  notes: text("notes"),
  // Google Drive
  driveFolderId: text("drive_folder_id"),
  driveFolderName: text("drive_folder_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const clientInvoices = sqliteTable("client_invoices", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  number: text("number").notNull(), // e.g. "INV-2026-001"
  title: text("title"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status", { enum: ["draft", "sent", "paid", "overdue", "void"] }).notNull().default("draft"),
  issuedDate: integer("issued_date", { mode: "timestamp" }),
  dueDate: integer("due_date", { mode: "timestamp" }),
  paidDate: integer("paid_date", { mode: "timestamp" }),
  items: text("items").default("[]"), // JSON array of line items
  notes: text("notes"),
  filePath: text("file_path"), // optional PDF
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const clientPayments = sqliteTable("client_payments", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  invoiceId: text("invoice_id").references(() => clientInvoices.id, { onDelete: "set null" }),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentDate: integer("payment_date", { mode: "timestamp" }).notNull(),
  reference: text("reference"), // bank reference / transaction ID
  source: text("source", { enum: ["bank_import", "manual", "stripe", "other"] }).notNull().default("manual"),
  rawDescription: text("raw_description"), // unprocessed bank statement line
  matched: integer("matched", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const clientLinks = sqliteTable("client_links", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(), // "meta_ads", "google_ads", "google_analytics", "slack", "drive", "custom"
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Project ↔ Client junction (many-to-many)
export const projectClients = sqliteTable("project_clients", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ CRM LEADS ============
export const leads = sqliteTable("leads", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  // Lead identity
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  website: text("website"),
  jobTitle: text("job_title"),
  // Source & lifecycle
  source: text("source", { enum: ["inbound", "outbound", "referral", "social", "website", "event", "import", "manual"] }).notNull().default("manual"),
  sourceDetail: text("source_detail"), // free text — "Acme referral", "Q1 trade show", URL, etc.
  status: text("status", { enum: ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost", "nurture"] }).notNull().default("new"),
  // Value
  estimatedValue: real("estimated_value"),
  currency: text("currency").default("USD"),
  // Service interest
  services: text("services").default("[]"), // JSON array of service tags
  // Notes & tracking
  notes: text("notes"),
  tags: text("tags").default("[]"), // JSON array
  customFields: text("custom_fields").default("{}"),
  // Conversion
  convertedClientId: text("converted_client_id").references(() => clients.id, { onDelete: "set null" }),
  convertedAt: integer("converted_at", { mode: "timestamp" }),
  // Activity
  lastContactedAt: integer("last_contacted_at", { mode: "timestamp" }),
  nextFollowUpAt: integer("next_follow_up_at", { mode: "timestamp" }),
  assignedToId: text("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const leadActivities = sqliteTable("lead_activities", {
  id: text("id").primaryKey(),
  leadId: text("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type", { enum: ["note", "call", "email", "meeting", "task", "status_change"] }).notNull().default("note"),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TEAM WORKSPACE (2D pixel-art office) ============
export const teamWorkspace = sqliteTable("team_workspace", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  // Pixel-art character
  character: text("character").notNull().default("dev_1"), // sprite key (dev_1, designer_1, etc.)
  characterColor: text("character_color").notNull().default("#99ff33"),
  // Position on the office grid
  x: integer("x").notNull().default(5),
  y: integer("y").notNull().default(5),
  // Status
  statusEmoji: text("status_emoji").default("💻"),
  statusText: text("status_text"),
  isOnline: integer("is_online", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PROJECTS ============
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#99ff33"), // Edge Point brand green
  icon: text("icon"), // emoji like "\u{1F4C1}" or null
  category: text("category"), // client name (legacy text) — superseded by clientId
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  campaign: text("campaign"), // higher-level grouping (e.g. "Spring 2026 Campaign")
  driveFolderId: text("drive_folder_id"),
  driveFolderName: text("drive_folder_name"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }), // null = personal
  ownerId: text("owner_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PROJECT STATUSES (custom Notion-style statuses) ============
export const projectStatuses = sqliteTable("project_statuses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isFinal: integer("is_final", { mode: "boolean" }).notNull().default(false), // "done" equivalent
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ SECTIONS ============
export const sections = sqliteTable("sections", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TASKS ============
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status", { enum: ["todo", "in_progress", "done", "blocked"] }).notNull().default("todo"),
  priority: text("priority", { enum: ["low", "medium", "high", "urgent"] }).notNull().default("medium"),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
  sectionId: text("section_id").references(() => sections.id, { onDelete: "set null" }),
  assigneeId: text("assignee_id").references(() => users.id),
  createdById: text("created_by_id").notNull().references(() => users.id),
  dueDate: integer("due_date", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  aiPriorityScore: real("ai_priority_score"),
  aiPriorityReason: text("ai_priority_reason"),
  sortOrder: integer("sort_order").notNull().default(0),
  startDate: integer("start_date", { mode: "timestamp" }),
  isMilestone: integer("is_milestone", { mode: "boolean" }).notNull().default(false),
  taskType: text("task_type", { enum: ["task", "milestone", "approval"] }).notNull().default("task"),
  estimatedHours: real("estimated_hours"),
  statusId: text("status_id").references(() => projectStatuses.id, { onDelete: "set null" }),
  recurrenceRule: text("recurrence_rule"), // JSON: { frequency, interval, dayOfWeek, etc. }
  recurrenceParentId: text("recurrence_parent_id"), // original recurring task
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ LABELS ============
export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#8b5cf6"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }), // null = personal/global
});

export const taskLabels = sqliteTable("task_labels", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  labelId: text("label_id").notNull().references(() => labels.id, { onDelete: "cascade" }),
});

// ============ COMMENTS (AI Chat) ============
export const taskComments = sqliteTable("task_comments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  authorId: text("author_id").references(() => users.id), // null for AI messages
  isAi: integer("is_ai", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TASK REACTIONS ============
export const taskReactions = sqliteTable("task_reactions", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  commentId: text("comment_id").references(() => taskComments.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull().default("\u{1F44D}"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ SUBTASKS ============
export const subtasks = sqliteTable("subtasks", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isDone: integer("is_done", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ============ TASK DEPENDENCIES ============
export const taskDependencies = sqliteTable("task_dependencies", {
  id: text("id").primaryKey(),
  dependentTaskId: text("dependent_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }), // the blocked task
  dependencyTaskId: text("dependency_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }), // the blocker
  type: text("type", { enum: ["blocked_by", "related_to"] }).notNull().default("blocked_by"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TASK ATTACHMENTS ============
export const taskAttachments = sqliteTable("task_attachments", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ CUSTOM FIELDS ============
export const customFieldDefinitions = sqliteTable("custom_field_definitions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type", { enum: ["text", "number", "date", "select", "multi_select"] }).notNull(),
  options: text("options"), // JSON array for select/multi_select types
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const customFieldValues = sqliteTable("custom_field_values", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  fieldId: text("field_id").notNull().references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
  value: text("value"), // serialized value
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ API KEYS ============
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull(),
  name: text("name").notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TELEGRAM ============
export const telegramLinks = sqliteTable("telegram_links", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  telegramChatId: text("telegram_chat_id").notNull(),
  telegramUsername: text("telegram_username"),
  linkedAt: integer("linked_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  notifyDigest: integer("notify_digest", { mode: "boolean" }).notNull().default(true),
  notifyAssignments: integer("notify_assignments", { mode: "boolean" }).notNull().default(true),
  notifyOverdue: integer("notify_overdue", { mode: "boolean" }).notNull().default(true),
  digestTime: text("digest_time").notNull().default("09:00"),
});

// ============ DOCUMENTS ============
export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  uploadedById: text("uploaded_by_id").notNull().references(() => users.id),
  filename: text("filename").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(), // pdf, doc, docx, ppt, pptx
  fileSize: integer("file_size").notNull(),
  extractedText: text("extracted_text"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PROJECT BRIEFS ============
export const projectBriefs = sqliteTable("project_briefs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
  content: text("content").notNull().default("{}"), // JSON - Tiptap content
  updatedById: text("updated_by_id").references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ ACTIVITY LOG ============
export const activityLog = sqliteTable("activity_log", {
  id: text("id").primaryKey(),
  entityType: text("entity_type", { enum: ["task", "project", "team"] }).notNull(),
  entityId: text("entity_id").notNull(),
  userId: text("user_id").references(() => users.id),
  action: text("action", { enum: ["created", "updated", "deleted", "commented", "moved", "completed", "assigned"] }).notNull(),
  field: text("field"), // which field changed (e.g. "status", "priority")
  oldValue: text("old_value"),
  newValue: text("new_value"),
  metadata: text("metadata"), // JSON for extra context
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ NOTIFICATIONS ============
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["assigned", "mentioned", "commented", "status_changed", "due_soon", "completed", "message", "status_update", "team_added"] }).notNull(),
  title: text("title").notNull(),
  message: text("message"),
  entityType: text("entity_type", { enum: ["task", "project", "team"] }),
  entityId: text("entity_id"),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  snoozedUntil: integer("snoozed_until", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PUSH SUBSCRIPTIONS ============
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ FAVORITES ============
export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type", { enum: ["task", "project"] }).notNull(),
  entityId: text("entity_id").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ AUTOMATION RULES ============
export const automationRules = sqliteTable("automation_rules", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  trigger: text("trigger").notNull(), // JSON: { type: "status_changed"|"task_created"|"due_date"|"assigned", conditions: {} }
  actions: text("actions").notNull(), // JSON: [{ type: "set_status"|"set_priority"|"assign"|"add_comment"|"notify", params: {} }]
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TEMPLATES ============
export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type", { enum: ["project", "task"] }).notNull(),
  content: text("content").notNull(), // JSON: full project/task structure
  category: text("category"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdById: text("created_by_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ APPROVALS ============
export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  requestedById: text("requested_by_id").notNull().references(() => users.id),
  approverId: text("approver_id").notNull().references(() => users.id),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  comment: text("comment"),
  respondedAt: integer("responded_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ GOALS / OKRs ============
export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", { enum: ["goal", "objective"] }).notNull().default("goal"),
  status: text("status", { enum: ["not_started", "on_track", "at_risk", "off_track", "achieved"] }).notNull().default("not_started"),
  progress: integer("progress").notNull().default(0), // 0-100
  ownerId: text("owner_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  parentGoalId: text("parent_goal_id"), // self-referencing for nested goals
  startDate: integer("start_date", { mode: "timestamp" }),
  dueDate: integer("due_date", { mode: "timestamp" }),
  // SMART fields
  specific: text("specific"),
  measurable: text("measurable"),
  achievable: text("achievable"),
  relevant: text("relevant"),
  timeBound: text("time_bound"),
  reminders: text("reminders").default("[]"), // JSON array: [{ type, value, unit }]
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const keyResults = sqliteTable("key_results", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  targetValue: real("target_value").notNull().default(100),
  currentValue: real("current_value").notNull().default(0),
  unit: text("unit").notNull().default("%"), // %, count, currency, etc.
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const goalLinks = sqliteTable("goal_links", {
  id: text("id").primaryKey(),
  goalId: text("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
  entityType: text("entity_type", { enum: ["project", "task"] }).notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ TASK COLLABORATORS ============
export const taskCollaborators = sqliteTable("task_collaborators", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["assignee", "reviewer", "follower"] }).notNull().default("follower"),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PORTFOLIOS ============
export const portfolios = sqliteTable("portfolios", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  ownerId: text("owner_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const portfolioProjects = sqliteTable("portfolio_projects", {
  id: text("id").primaryKey(),
  portfolioId: text("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  position: integer("position").notNull().default(0),
  status: text("status", { enum: ["on_track", "at_risk", "off_track", "complete"] }).notNull().default("on_track"),
  statusNote: text("status_note"),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ ACCOUNTS (OAuth tokens) ============
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "oauth" | "credentials"
  provider: text("provider").notNull(), // "google"
  providerAccountId: text("provider_account_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
  providerEmail: text("provider_email"), // e.g. Google email
});

// ============ USER PREFERENCES ============
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  workStartTime: text("work_start_time").notNull().default("09:00"),
  lunchStartTime: text("lunch_start_time").notNull().default("12:00"),
  lunchEndTime: text("lunch_end_time").notNull().default("13:00"),
  workEndTime: text("work_end_time").notNull().default("17:00"),
  timezone: text("timezone").notNull().default("America/New_York"),
  preferredBlockDuration: integer("preferred_block_duration").notNull().default(60),
  focusTimePreference: text("focus_time_preference", { enum: ["morning", "afternoon", "mixed"] }).notNull().default("morning"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ CALENDAR EVENTS ============
export const calendarEvents = sqliteTable("calendar_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  googleEventId: text("google_event_id"),
  title: text("title").notNull(),
  description: text("description"),
  startTime: integer("start_time", { mode: "timestamp" }).notNull(),
  endTime: integer("end_time", { mode: "timestamp" }).notNull(),
  isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
  location: text("location"),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  source: text("source", { enum: ["google", "ai_block", "manual"] }).notNull().default("google"),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
});

// ============ TIME BLOCKS ============
export const timeBlocks = sqliteTable("time_blocks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  category: text("category", { enum: ["deep_work", "creative", "admin", "meeting", "break", "review", "quick_tasks"] }).notNull().default("deep_work"),
  startTime: integer("start_time", { mode: "timestamp" }).notNull(),
  endTime: integer("end_time", { mode: "timestamp" }).notNull(),
  isLocked: integer("is_locked", { mode: "boolean" }).notNull().default(false),
  aiGenerated: integer("ai_generated", { mode: "boolean" }).notNull().default(false),
  googleEventId: text("google_event_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ CALENDAR SYNC STATUS ============
export const calendarSyncStatus = sqliteTable("calendar_sync_status", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  syncToken: text("sync_token"),
  status: text("status", { enum: ["idle", "syncing", "error"] }).notNull().default("idle"),
  errorMessage: text("error_message"),
});

// ============ AI CONVERSATIONS ============
export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Chat"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => aiConversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull().default(""),
  toolName: text("tool_name"),
  toolArgs: text("tool_args"), // JSON
  toolResult: text("tool_result"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PROJECT MESSAGES ============
export const projectMessages = sqliteTable("project_messages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => users.id),
  title: text("title"),
  content: text("content").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ PROJECT STATUS UPDATES ============
export const projectStatusUpdates = sqliteTable("project_status_updates", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["on_track", "at_risk", "off_track", "on_hold", "complete"] }).notNull(),
  summary: text("summary").notNull(),
  highlights: text("highlights"), // JSON array of strings
  blockers: text("blockers"), // JSON array of strings
  authorId: text("author_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ FORMS ============
export const forms = sqliteTable("forms", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(true),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const formFields = sqliteTable("form_fields", {
  id: text("id").primaryKey(),
  formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  type: text("type", { enum: ["text", "textarea", "number", "date", "select", "checkbox"] }).notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  options: text("options"), // JSON array for select
  mapsTo: text("maps_to"), // "title", "description", "priority", "dueDate" or customFieldId
  position: integer("position").notNull().default(0),
});

export const formSubmissions = sqliteTable("form_submissions", {
  id: text("id").primaryKey(),
  formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
  data: text("data").notNull(), // JSON of field values
  createdTaskId: text("created_task_id").references(() => tasks.id, { onDelete: "set null" }),
  submitterName: text("submitter_name"),
  submitterEmail: text("submitter_email"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ BUNDLES ============
export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  manifest: text("manifest").notNull(), // JSON: { rules, customFields, sections, views }
  createdById: text("created_by_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ REPORTS ============
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  ownerId: text("owner_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  layout: text("layout").notNull().default("[]"), // JSON array of widgets
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ JARVIS: META AD OPTIMIZER ============
// Ported from Supabase Postgres schema in /Users/sheng/Desktop/jarvis
// Every table is user-scoped (userId FK) so ad data is isolated per account.

// ---- Brands ----
// Represents one Meta ad account. `config` is the BrandConfig JSON blob
// (thresholds, toggles, preferences, insights_date_range, cost_metric, spend_limit).
export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }), // linked ai-tasks project (auto-created on import)
  name: text("name").notNull(),
  metaAccountId: text("meta_account_id").notNull(),
  config: text("config").notNull().default("{}"), // JSON BrandConfig
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Meta Campaigns ----
// Renamed from Jarvis `campaigns` to avoid future naming conflicts in ai-tasks.
export const metaCampaigns = sqliteTable("meta_campaigns", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  metaCampaignId: text("meta_campaign_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("UNKNOWN"),
  objective: text("objective"),
  dailyBudget: real("daily_budget"),
  lifetimeBudget: real("lifetime_budget"),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Meta Ad Sets ----
// Renamed from Jarvis `ad_sets`.
export const metaAdSets = sqliteTable("meta_ad_sets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").notNull().references(() => metaCampaigns.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  metaAdsetId: text("meta_adset_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("UNKNOWN"),
  dailyBudget: real("daily_budget"),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Meta Ads ----
// Renamed from Jarvis `ads`. KPIs here are aggregated totals across the sync window;
// per-day numbers live in adDailyInsights.
export const metaAds = sqliteTable("meta_ads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  adSetId: text("ad_set_id").notNull().references(() => metaAdSets.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  metaAdId: text("meta_ad_id").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull().default("UNKNOWN"),
  cpl: real("cpl"),
  ctr: real("ctr"),
  frequency: real("frequency"),
  spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  syncedAt: integer("synced_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Ad Daily Insights ----
// One row per (ad, date). Date stored as ISO yyyy-mm-dd string.
export const adDailyInsights = sqliteTable("ad_daily_insights", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  adId: text("ad_id").notNull().references(() => metaAds.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  date: text("date").notNull(), // yyyy-mm-dd
  spend: real("spend").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  leads: integer("leads").notNull().default(0),
  cpl: real("cpl"),
  ctr: real("ctr"),
  frequency: real("frequency"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Decision Journal ----
// Records each monitor cycle recommendation and the AI Guard verdict.
export const decisionJournal = sqliteTable("decision_journal", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  adId: text("ad_id").references(() => metaAds.id, { onDelete: "set null" }),
  adSetId: text("ad_set_id").references(() => metaAdSets.id, { onDelete: "set null" }),
  recommendation: text("recommendation", { enum: ["kill", "pause", "boost_budget", "duplicate"] }).notNull(),
  reason: text("reason").notNull(),
  kpiValues: text("kpi_values"), // JSON
  guardVerdict: text("guard_verdict", { enum: ["approved", "rejected", "pending"] }).notNull(),
  guardReasoning: text("guard_reasoning"),
  confidence: real("confidence"),
  riskLevel: text("risk_level", { enum: ["low", "medium", "high"] }),
  actionTaken: integer("action_taken", { mode: "boolean" }).notNull().default(false),
  actionResult: text("action_result"), // JSON
  // When the operator approves a boost_budget with a custom amount instead of
  // the default *1.5, the chosen value lives here. Read by the executor;
  // overrides the projected budget at whatever level (ad_set/campaign) ends
  // up holding the budget. Stored in major currency units (RM), same as
  // metaAdSets.dailyBudget / metaCampaigns.dailyBudget.
  userOverrideBudget: real("user_override_budget"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Agent Memory ----
// Long-term memory for the learning agent (weekly summaries, user preferences, patterns).
export const agentMemory = sqliteTable("agent_memory", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  brandId: text("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  memoryType: text("memory_type", { enum: ["weekly_summary", "preference", "pattern"] }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"), // JSON, optional extra context
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Marketing Audit Log ----
// Separate from `activityLog` (which is for tasks/projects). This is Jarvis's event log.
export const marketingAuditLog = sqliteTable("marketing_audit_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  payload: text("payload"), // JSON
  level: text("level", { enum: ["info", "warn", "error", "debug"] }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Global Settings ----
// Per-user key/value store (schedule_interval_hours, global_pause, etc.).
export const globalSettings = sqliteTable("global_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: text("value").notNull(), // JSON-encoded
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- App Config ----
// Global, instance-wide key/value store for things like the OpenAI API key
// that the user sets via the Settings UI instead of editing the .env file.
// Encrypted values are stored as JSON: {iv, tag, data} (AES-256-GCM).
export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ---- Sync Jobs ----
// Background-job tracker. Long-running endpoints (Meta sync, monitor audit,
// sheet sync) insert a row, return 202, then update status from a detached
// promise. UI polls /api/jobs/active to surface progress + failures so the
// operator can navigate away while work continues.
export const syncJobs = sqliteTable("sync_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "meta_sync" | "monitor_audit" | "leads_sheets_sync" | ...
  status: text("status", { enum: ["queued", "running", "succeeded", "failed"] }).notNull().default("queued"),
  label: text("label"), // human-readable summary, e.g. "Sync brand: Acme"
  payload: text("payload"), // JSON input for context
  result: text("result"), // JSON output on success
  error: text("error"), // error message on failure
  startedAt: integer("started_at", { mode: "timestamp" }),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ WORKFLOW CHAINS ============
// A chain is a sequence of tasks that auto-advance when the current task is completed/approved.
export const workflowChains = sqliteTable("workflow_chains", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdById: text("created_by_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const workflowChainSteps = sqliteTable("workflow_chain_steps", {
  id: text("id").primaryKey(),
  chainId: text("chain_id").notNull().references(() => workflowChains.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  taskTitle: text("task_title").notNull(), // template for the task to create
  taskDescription: text("task_description"),
  assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
  trigger: text("trigger", { enum: ["completed", "approved", "manual"] }).notNull().default("completed"),
  delayHours: integer("delay_hours").notNull().default(0), // wait N hours after trigger
  action: text("action", { enum: ["create_task", "notify", "upload_to_drive", "ai_verify_drive"] }).notNull().default("create_task"),
  actionConfig: text("action_config").default("{}"), // JSON extra config per action type
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const workflowChainRuns = sqliteTable("workflow_chain_runs", {
  id: text("id").primaryKey(),
  chainId: text("chain_id").notNull().references(() => workflowChains.id, { onDelete: "cascade" }),
  currentStepId: text("current_step_id").references(() => workflowChainSteps.id, { onDelete: "set null" }),
  status: text("status", { enum: ["running", "paused", "completed", "failed"] }).notNull().default("running"),
  log: text("log").default("[]"), // JSON array of { stepId, action, ts, result }
  startedAt: integer("started_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ============ RELATIONS ============
export const usersRelations = relations(users, ({ many }) => ({
  teams: many(teamMembers),
  projects: many(projects),
  tasks: many(tasks, { relationName: "assignee" }),
  createdTasks: many(tasks, { relationName: "creator" }),
  comments: many(taskComments),
  apiKeys: many(apiKeys),
  telegramLink: many(telegramLinks),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, { fields: [teams.ownerId], references: [users.id] }),
  members: many(teamMembers),
  projects: many(projects),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  team: one(teams, { fields: [projects.teamId], references: [teams.id] }),
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  tasks: many(tasks),
  sections: many(sections),
  documents: many(documents),
  brief: many(projectBriefs),
  statuses: many(projectStatuses),
  workflowChains: many(workflowChains),
  linkedClients: many(projectClients),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  owner: one(users, { fields: [clients.ownerId], references: [users.id] }),
  team: one(teams, { fields: [clients.teamId], references: [teams.id] }),
  projects: many(projects),
  invoices: many(clientInvoices),
  payments: many(clientPayments),
  links: many(clientLinks),
  linkedProjects: many(projectClients),
  tasks: many(tasks),
}));

export const clientInvoicesRelations = relations(clientInvoices, ({ one, many }) => ({
  client: one(clients, { fields: [clientInvoices.clientId], references: [clients.id] }),
  payments: many(clientPayments),
}));

export const clientPaymentsRelations = relations(clientPayments, ({ one }) => ({
  client: one(clients, { fields: [clientPayments.clientId], references: [clients.id] }),
  invoice: one(clientInvoices, { fields: [clientPayments.invoiceId], references: [clientInvoices.id] }),
}));

export const clientLinksRelations = relations(clientLinks, ({ one }) => ({
  client: one(clients, { fields: [clientLinks.clientId], references: [clients.id] }),
}));

export const projectClientsRelations = relations(projectClients, ({ one }) => ({
  project: one(projects, { fields: [projectClients.projectId], references: [projects.id] }),
  client: one(clients, { fields: [projectClients.clientId], references: [clients.id] }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  owner: one(users, { fields: [leads.ownerId], references: [users.id] }),
  assignedTo: one(users, { fields: [leads.assignedToId], references: [users.id], relationName: "leadAssignee" }),
  team: one(teams, { fields: [leads.teamId], references: [teams.id] }),
  convertedClient: one(clients, { fields: [leads.convertedClientId], references: [clients.id] }),
  activities: many(leadActivities),
}));

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, { fields: [leadActivities.leadId], references: [leads.id] }),
  user: one(users, { fields: [leadActivities.userId], references: [users.id] }),
}));

export const teamWorkspaceRelations = relations(teamWorkspace, ({ one }) => ({
  user: one(users, { fields: [teamWorkspace.userId], references: [users.id] }),
  team: one(teams, { fields: [teamWorkspace.teamId], references: [teams.id] }),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  project: one(projects, { fields: [sections.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  section: one(sections, { fields: [tasks.sectionId], references: [sections.id] }),
  customStatus: one(projectStatuses, { fields: [tasks.statusId], references: [projectStatuses.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id], relationName: "assignee" }),
  createdBy: one(users, { fields: [tasks.createdById], references: [users.id], relationName: "creator" }),
  comments: many(taskComments),
  subtasks: many(subtasks),
  labels: many(taskLabels),
  attachments: many(taskAttachments),
  dependencies: many(taskDependencies, { relationName: "dependent" }),
  blockedBy: many(taskDependencies, { relationName: "dependency" }),
  customFieldValues: many(customFieldValues),
  reactions: many(taskReactions),
}));

export const taskCommentsRelations = relations(taskComments, ({ one, many }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
  reactions: many(taskReactions),
}));

export const taskReactionsRelations = relations(taskReactions, ({ one }) => ({
  task: one(tasks, { fields: [taskReactions.taskId], references: [tasks.id] }),
  comment: one(taskComments, { fields: [taskReactions.commentId], references: [taskComments.id] }),
  user: one(users, { fields: [taskReactions.userId], references: [users.id] }),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}));

export const labelsRelations = relations(labels, ({ many }) => ({
  tasks: many(taskLabels),
}));

export const taskLabelsRelations = relations(taskLabels, ({ one }) => ({
  task: one(tasks, { fields: [taskLabels.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabels.labelId], references: [labels.id] }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  project: one(projects, { fields: [documents.projectId], references: [projects.id] }),
  uploadedBy: one(users, { fields: [documents.uploadedById], references: [users.id] }),
}));

export const projectBriefsRelations = relations(projectBriefs, ({ one }) => ({
  project: one(projects, { fields: [projectBriefs.projectId], references: [projects.id] }),
  updatedBy: one(users, { fields: [projectBriefs.updatedById], references: [users.id] }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  dependentTask: one(tasks, { fields: [taskDependencies.dependentTaskId], references: [tasks.id], relationName: "dependent" }),
  dependencyTask: one(tasks, { fields: [taskDependencies.dependencyTaskId], references: [tasks.id], relationName: "dependency" }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAttachments.userId], references: [users.id] }),
}));

export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one, many }) => ({
  project: one(projects, { fields: [customFieldDefinitions.projectId], references: [projects.id] }),
  values: many(customFieldValues),
}));

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  task: one(tasks, { fields: [customFieldValues.taskId], references: [tasks.id] }),
  field: one(customFieldDefinitions, { fields: [customFieldValues.fieldId], references: [customFieldDefinitions.id] }),
}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(users, { fields: [activityLog.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
}));

export const goalsRelations = relations(goals, ({ one, many }) => ({
  owner: one(users, { fields: [goals.ownerId], references: [users.id] }),
  team: one(teams, { fields: [goals.teamId], references: [teams.id] }),
  keyResults: many(keyResults),
  links: many(goalLinks),
}));

export const keyResultsRelations = relations(keyResults, ({ one }) => ({
  goal: one(goals, { fields: [keyResults.goalId], references: [goals.id] }),
}));

export const goalLinksRelations = relations(goalLinks, ({ one }) => ({
  goal: one(goals, { fields: [goalLinks.goalId], references: [goals.id] }),
}));

export const taskCollaboratorsRelations = relations(taskCollaborators, ({ one }) => ({
  task: one(tasks, { fields: [taskCollaborators.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskCollaborators.userId], references: [users.id] }),
}));

export const automationRulesRelations = relations(automationRules, ({ one }) => ({
  project: one(projects, { fields: [automationRules.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [automationRules.createdById], references: [users.id] }),
}));

export const templatesRelations = relations(templates, ({ one }) => ({
  createdBy: one(users, { fields: [templates.createdById], references: [users.id] }),
  team: one(teams, { fields: [templates.teamId], references: [teams.id] }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  task: one(tasks, { fields: [approvals.taskId], references: [tasks.id] }),
  requestedBy: one(users, { fields: [approvals.requestedById], references: [users.id] }),
  approver: one(users, { fields: [approvals.approverId], references: [users.id] }),
}));

export const portfoliosRelations = relations(portfolios, ({ one, many }) => ({
  owner: one(users, { fields: [portfolios.ownerId], references: [users.id] }),
  team: one(teams, { fields: [portfolios.teamId], references: [teams.id] }),
  projects: many(portfolioProjects),
}));

export const portfolioProjectsRelations = relations(portfolioProjects, ({ one }) => ({
  portfolio: one(portfolios, { fields: [portfolioProjects.portfolioId], references: [portfolios.id] }),
  project: one(projects, { fields: [portfolioProjects.projectId], references: [projects.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  user: one(users, { fields: [calendarEvents.userId], references: [users.id] }),
  task: one(tasks, { fields: [calendarEvents.taskId], references: [tasks.id] }),
}));

export const timeBlocksRelations = relations(timeBlocks, ({ one }) => ({
  user: one(users, { fields: [timeBlocks.userId], references: [users.id] }),
  task: one(tasks, { fields: [timeBlocks.taskId], references: [tasks.id] }),
}));

export const calendarSyncStatusRelations = relations(calendarSyncStatus, ({ one }) => ({
  user: one(users, { fields: [calendarSyncStatus.userId], references: [users.id] }),
}));

export const aiConversationsRelations = relations(aiConversations, ({ one, many }) => ({
  user: one(users, { fields: [aiConversations.userId], references: [users.id] }),
  messages: many(aiMessages),
}));

export const aiMessagesRelations = relations(aiMessages, ({ one }) => ({
  conversation: one(aiConversations, { fields: [aiMessages.conversationId], references: [aiConversations.id] }),
}));

export const projectMessagesRelations = relations(projectMessages, ({ one }) => ({
  project: one(projects, { fields: [projectMessages.projectId], references: [projects.id] }),
  author: one(users, { fields: [projectMessages.authorId], references: [users.id] }),
}));

export const projectStatusUpdatesRelations = relations(projectStatusUpdates, ({ one }) => ({
  project: one(projects, { fields: [projectStatusUpdates.projectId], references: [projects.id] }),
  author: one(users, { fields: [projectStatusUpdates.authorId], references: [users.id] }),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  project: one(projects, { fields: [forms.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [forms.createdById], references: [users.id] }),
  fields: many(formFields),
  submissions: many(formSubmissions),
}));

export const formFieldsRelations = relations(formFields, ({ one }) => ({
  form: one(forms, { fields: [formFields.formId], references: [forms.id] }),
}));

export const formSubmissionsRelations = relations(formSubmissions, ({ one }) => ({
  form: one(forms, { fields: [formSubmissions.formId], references: [forms.id] }),
  createdTask: one(tasks, { fields: [formSubmissions.createdTaskId], references: [tasks.id] }),
}));

export const bundlesRelations = relations(bundles, ({ one }) => ({
  createdBy: one(users, { fields: [bundles.createdById], references: [users.id] }),
  team: one(teams, { fields: [bundles.teamId], references: [teams.id] }),
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  owner: one(users, { fields: [reports.ownerId], references: [users.id] }),
  team: one(teams, { fields: [reports.teamId], references: [teams.id] }),
}));

// ============ JARVIS RELATIONS ============
export const brandsRelations = relations(brands, ({ one, many }) => ({
  user: one(users, { fields: [brands.userId], references: [users.id] }),
  team: one(teams, { fields: [brands.teamId], references: [teams.id] }),
  project: one(projects, { fields: [brands.projectId], references: [projects.id] }),
  campaigns: many(metaCampaigns),
  adSets: many(metaAdSets),
  ads: many(metaAds),
  dailyInsights: many(adDailyInsights),
  journal: many(decisionJournal),
  memories: many(agentMemory),
}));

export const metaCampaignsRelations = relations(metaCampaigns, ({ one, many }) => ({
  user: one(users, { fields: [metaCampaigns.userId], references: [users.id] }),
  brand: one(brands, { fields: [metaCampaigns.brandId], references: [brands.id] }),
  adSets: many(metaAdSets),
}));

export const metaAdSetsRelations = relations(metaAdSets, ({ one, many }) => ({
  user: one(users, { fields: [metaAdSets.userId], references: [users.id] }),
  brand: one(brands, { fields: [metaAdSets.brandId], references: [brands.id] }),
  campaign: one(metaCampaigns, { fields: [metaAdSets.campaignId], references: [metaCampaigns.id] }),
  ads: many(metaAds),
}));

export const metaAdsRelations = relations(metaAds, ({ one, many }) => ({
  user: one(users, { fields: [metaAds.userId], references: [users.id] }),
  brand: one(brands, { fields: [metaAds.brandId], references: [brands.id] }),
  adSet: one(metaAdSets, { fields: [metaAds.adSetId], references: [metaAdSets.id] }),
  dailyInsights: many(adDailyInsights),
  journal: many(decisionJournal),
}));

export const adDailyInsightsRelations = relations(adDailyInsights, ({ one }) => ({
  user: one(users, { fields: [adDailyInsights.userId], references: [users.id] }),
  brand: one(brands, { fields: [adDailyInsights.brandId], references: [brands.id] }),
  ad: one(metaAds, { fields: [adDailyInsights.adId], references: [metaAds.id] }),
}));

export const decisionJournalRelations = relations(decisionJournal, ({ one }) => ({
  user: one(users, { fields: [decisionJournal.userId], references: [users.id] }),
  brand: one(brands, { fields: [decisionJournal.brandId], references: [brands.id] }),
  ad: one(metaAds, { fields: [decisionJournal.adId], references: [metaAds.id] }),
  adSet: one(metaAdSets, { fields: [decisionJournal.adSetId], references: [metaAdSets.id] }),
}));

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
  user: one(users, { fields: [agentMemory.userId], references: [users.id] }),
  brand: one(brands, { fields: [agentMemory.brandId], references: [brands.id] }),
}));

export const marketingAuditLogRelations = relations(marketingAuditLog, ({ one }) => ({
  user: one(users, { fields: [marketingAuditLog.userId], references: [users.id] }),
}));

export const globalSettingsRelations = relations(globalSettings, ({ one }) => ({
  user: one(users, { fields: [globalSettings.userId], references: [users.id] }),
}));

export const syncJobsRelations = relations(syncJobs, ({ one }) => ({
  user: one(users, { fields: [syncJobs.userId], references: [users.id] }),
}));

export const projectStatusesRelations = relations(projectStatuses, ({ one, many }) => ({
  project: one(projects, { fields: [projectStatuses.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const workflowChainsRelations = relations(workflowChains, ({ one, many }) => ({
  project: one(projects, { fields: [workflowChains.projectId], references: [projects.id] }),
  createdBy: one(users, { fields: [workflowChains.createdById], references: [users.id] }),
  steps: many(workflowChainSteps),
  runs: many(workflowChainRuns),
}));

export const workflowChainStepsRelations = relations(workflowChainSteps, ({ one }) => ({
  chain: one(workflowChains, { fields: [workflowChainSteps.chainId], references: [workflowChains.id] }),
  assignee: one(users, { fields: [workflowChainSteps.assigneeId], references: [users.id] }),
}));

export const workflowChainRunsRelations = relations(workflowChainRuns, ({ one }) => ({
  chain: one(workflowChains, { fields: [workflowChainRuns.chainId], references: [workflowChains.id] }),
  currentStep: one(workflowChainSteps, { fields: [workflowChainRuns.currentStepId], references: [workflowChainSteps.id] }),
}));
