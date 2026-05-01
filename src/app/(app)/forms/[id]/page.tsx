"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  select: "Select",
  checkbox: "Checkbox",
};

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

type FormField = {
  id: string;
  formId: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string | null;
  mapsTo: string | null;
  position: number;
};

type CustomField = {
  id: string;
  name: string;
  type: string;
};

type Form = {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  projectId: string;
  fields: FormField[];
  project: { id: string; name: string; color: string } | null;
};

const MAPS_TO_BUILTIN = [
  { value: "__none__", label: "(no mapping)" },
  { value: "title", label: "Task title" },
  { value: "description", label: "Task description" },
  { value: "priority", label: "Task priority" },
  { value: "dueDate", label: "Due date" },
];

export default function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Add field form
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<FieldType>("text");

  const loadForm = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/forms/${id}`);
    if (res.ok) {
      setForm(await res.json());
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setPublicUrl(`${window.location.origin}/f/${id}`);
  }, [id]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  useEffect(() => {
    if (!form?.projectId) return;
    fetch(`/api/projects/${form.projectId}/custom-fields`)
      .then((r) => r.json())
      .then((data) => setCustomFields(data.fields || []))
      .catch(() => {});
  }, [form?.projectId]);

  async function updateForm(updates: Partial<Form>) {
    const res = await fetch(`/api/forms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setForm((prev) => (prev ? { ...prev, ...updated } : updated));
    }
  }

  async function addField() {
    if (!newLabel.trim()) return;
    const res = await fetch(`/api/forms/${id}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: newLabel,
        type: newType,
        required: false,
      }),
    });
    if (res.ok) {
      setNewLabel("");
      setNewType("text");
      loadForm();
    }
  }

  async function updateField(fieldId: string, updates: Partial<FormField>) {
    const body: Record<string, unknown> = { fieldId };
    if (updates.label !== undefined) body.label = updates.label;
    if (updates.type !== undefined) body.type = updates.type;
    if (updates.required !== undefined) body.required = updates.required;
    if (updates.mapsTo !== undefined) body.mapsTo = updates.mapsTo;
    if (updates.options !== undefined) {
      body.options = updates.options
        ? JSON.parse(updates.options as unknown as string)
        : null;
    }
    await fetch(`/api/forms/${id}/fields`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    loadForm();
  }

  async function deleteField(fieldId: string) {
    const ok = await confirm({
      title: "Remove field?",
      description: "This field won't appear on new submissions.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/forms/${id}/fields`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId }),
    });
    loadForm();
  }

  async function deleteForm() {
    if (!form) return;
    const ok = await confirm({
      title: "Delete form?",
      description: `"${form.title}" and all its submissions will be permanently removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const res = await fetch(`/api/forms/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/forms");
  }

  async function reorderField(index: number, direction: -1 | 1) {
    if (!form) return;
    const fields = [...form.fields];
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    const orderedIds = fields.map((f) => f.id);
    await fetch(`/api/forms/${id}/fields`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    loadForm();
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
      alert(publicUrl);
    }
  }

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading form...</div>;
  }

  if (!form) {
    return <div className="p-6 text-muted-foreground">Form not found.</div>;
  }

  const mapsToOptions = [
    ...MAPS_TO_BUILTIN,
    ...customFields.map((cf) => ({
      value: cf.id,
      label: `Custom: ${cf.name}`,
    })),
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Form builder</h1>
          {form.project && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: form.project.color }}
              />
              {form.project.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button variant="outline" onClick={copyPublicUrl}>
            {copied ? "Copied!" : "Copy public URL"}
          </Button>
          <Button variant="destructive" onClick={deleteForm}>
            Delete form
          </Button>
        </div>
      </div>

      {/* Title + description */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onBlur={(e) => updateForm({ title: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              onBlur={(e) => updateForm({ description: e.target.value })}
              placeholder="Shown at the top of the public form"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublic"
              checked={form.isPublic}
              onChange={(e) => {
                setForm({ ...form, isPublic: e.target.checked });
                updateForm({ isPublic: e.target.checked });
              }}
            />
            <label htmlFor="isPublic" className="text-sm">
              Accept submissions from the public URL
            </label>
          </div>
          <div className="text-xs text-muted-foreground font-mono break-all">
            {publicUrl}
          </div>
        </CardContent>
      </Card>

      {/* Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
          <CardDescription>
            {preview
              ? "Preview of the public form"
              : "Use the arrows to reorder fields and map them to task properties."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preview ? (
            <PreviewForm form={form} />
          ) : (
            <>
              {form.fields.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No fields yet. Add one below.
                </p>
              ) : (
                <div className="space-y-3">
                  {form.fields.map((field, i) => (
                    <div
                      key={field.id}
                      className="border rounded-md p-3 space-y-3 bg-card"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            className="text-xs px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={i === 0}
                            onClick={() => reorderField(i, -1)}
                            aria-label="Move up"
                          >
                            &uarr;
                          </button>
                          <button
                            type="button"
                            className="text-xs px-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                            disabled={i === form.fields.length - 1}
                            onClick={() => reorderField(i, 1)}
                            aria-label="Move down"
                          >
                            &darr;
                          </button>
                        </div>
                        <Input
                          value={field.label}
                          onChange={(e) => {
                            setForm({
                              ...form,
                              fields: form.fields.map((f) =>
                                f.id === field.id
                                  ? { ...f, label: e.target.value }
                                  : f
                              ),
                            });
                          }}
                          onBlur={(e) =>
                            updateField(field.id, { label: e.target.value })
                          }
                          placeholder="Field label"
                        />
                        <Badge variant="outline">#{i + 1}</Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">Type</label>
                          <Select
                            value={field.type}
                            onValueChange={(v) =>
                              v &&
                              updateField(field.id, {
                                type: v as FieldType,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {FIELD_TYPE_LABELS[field.type]}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="textarea">
                                Long text
                              </SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                              <SelectItem value="date">Date</SelectItem>
                              <SelectItem value="select">Select</SelectItem>
                              <SelectItem value="checkbox">Checkbox</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">
                            Maps to
                          </label>
                          <Select
                            value={field.mapsTo ?? "__none__"}
                            onValueChange={(v) =>
                              v &&
                              updateField(field.id, {
                                mapsTo: v === "__none__" ? null : v,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {mapsToOptions.find(
                                  (opt) =>
                                    opt.value ===
                                    (field.mapsTo ?? "__none__")
                                )?.label ?? "(no mapping)"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {mapsToOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) =>
                                updateField(field.id, {
                                  required: e.target.checked,
                                })
                              }
                            />
                            Required
                          </label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => deleteField(field.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                      {field.type === "select" && (
                        <div className="space-y-1">
                          <label className="text-xs font-medium">
                            Options (comma-separated)
                          </label>
                          <Input
                            defaultValue={
                              field.options
                                ? (() => {
                                    try {
                                      return (
                                        JSON.parse(field.options) as string[]
                                      ).join(", ");
                                    } catch {
                                      return "";
                                    }
                                  })()
                                : ""
                            }
                            onBlur={(e) => {
                              const list = e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean);
                              updateField(field.id, {
                                options: JSON.stringify(list) as unknown as string,
                              });
                            }}
                            placeholder="Option 1, Option 2, Option 3"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add field */}
              <div className="border-t pt-4 space-y-3">
                <p className="text-sm font-medium">+ Add field</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-medium">Label</label>
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      placeholder="e.g. What do you need?"
                    />
                  </div>
                  <div className="w-36 space-y-1">
                    <label className="text-xs font-medium">Type</label>
                    <Select
                      value={newType}
                      onValueChange={(v) => v && setNewType(v as FieldType)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue>{FIELD_TYPE_LABELS[newType]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="textarea">Long text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="date">Date</SelectItem>
                        <SelectItem value="select">Select</SelectItem>
                        <SelectItem value="checkbox">Checkbox</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addField}>Add</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewForm({ form }: { form: Form }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{form.title}</h2>
        {form.description && (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        )}
      </div>
      {form.fields.map((field) => (
        <div key={field.id} className="space-y-1">
          <label className="text-sm font-medium">
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </label>
          {field.type === "text" && <Input disabled placeholder="" />}
          {field.type === "textarea" && <Textarea disabled placeholder="" />}
          {field.type === "number" && <Input type="number" disabled />}
          {field.type === "date" && <Input type="date" disabled />}
          {field.type === "checkbox" && (
            <input type="checkbox" disabled className="ml-1" />
          )}
          {field.type === "select" && (
            <Select disabled value="">
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                {(() => {
                  if (!field.options) return null;
                  try {
                    const opts = JSON.parse(field.options) as string[];
                    return opts.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ));
                  } catch {
                    return null;
                  }
                })()}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
      <Button disabled>Submit</Button>
    </div>
  );
}
