"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FieldDef = {
  id: string;
  name: string;
  type: string;
  options: string | null;
  required: boolean;
};

const TYPE_LABELS: Record<string, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Select",
  multi_select: "Multi Select",
};

type FieldValue = {
  id: string;
  fieldId: string;
  value: string | null;
  field: FieldDef;
};

// Display custom field values on a task
export function TaskCustomFields({ taskId, projectId }: { taskId: string; projectId: string }) {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<string, string | null>>({});

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}/custom-fields`).then(r => r.json()),
      fetch(`/api/tasks/${taskId}/custom-fields`).then(r => r.json()),
    ]).then(([fieldsData, valuesData]) => {
      setFields(fieldsData.fields || []);
      const valueMap: Record<string, string | null> = {};
      for (const v of (valuesData.values || []) as FieldValue[]) {
        valueMap[v.fieldId] = v.value;
      }
      setValues(valueMap);
    });
  }, [taskId, projectId]);

  async function updateValue(fieldId: string, value: string | null) {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    await fetch(`/api/tasks/${taskId}/custom-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId, value }),
    });
  }

  if (fields.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-medium text-sm">Custom Fields</h3>
      <div className="space-y-2">
        {fields.map(field => (
          <div key={field.id} className="space-y-0.5">
            <label className="text-xs font-medium text-muted-foreground uppercase">{field.name}</label>
            <CustomFieldInput
              field={field}
              value={values[field.id] || null}
              onChange={(v) => updateValue(field.id, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomFieldInput({ field, value, onChange }: { field: FieldDef; value: string | null; onChange: (v: string | null) => void }) {
  switch (field.type) {
    case "text":
      return (
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={`Enter ${field.name}...`}
          className="text-sm h-8"
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="0"
          className="text-sm h-8"
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={value || ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="text-sm h-8"
        />
      );
    case "select": {
      let options: string[] = [];
      try { options = JSON.parse(field.options || "[]"); } catch {}
      return (
        <Select value={value || ""} onValueChange={(v) => onChange(v || null)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue placeholder={`Select ${field.name}...`} />
          </SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case "multi_select": {
      let options: string[] = [];
      try { options = JSON.parse(field.options || "[]"); } catch {}
      const selected = value ? value.split(",") : [];
      return (
        <div className="flex flex-wrap gap-1">
          {options.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                onClick={() => {
                  const newSelected = isSelected
                    ? selected.filter(s => s !== opt)
                    : [...selected, opt];
                  onChange(newSelected.length > 0 ? newSelected.join(",") : null);
                }}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  isSelected ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
                }`}
                type="button"
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }
    default:
      return <p className="text-sm text-muted-foreground">Unsupported type</p>;
  }
}

// Manage custom field definitions for a project
export function ProjectCustomFieldSettings({ projectId }: { projectId: string }) {
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("text");
  const [newOptions, setNewOptions] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchFields = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/custom-fields`);
    const data = await res.json();
    setFields(data.fields || []);
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount/dep change; not migrating to Suspense
    fetchFields();
  }, [fetchFields]);

  function commitOptionDraft() {
    const parts = optionDraft
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
      .filter((o) => !newOptions.includes(o));
    if (parts.length === 0) return;
    setNewOptions((prev) => [...prev, ...parts]);
    setOptionDraft("");
  }

  function resetForm() {
    setNewName("");
    setNewType("text");
    setNewOptions([]);
    setOptionDraft("");
    setAdding(false);
    setError(null);
  }

  async function addField() {
    if (!newName.trim()) {
      setError("Name is required.");
      return;
    }

    const needsOptions = newType === "select" || newType === "multi_select";
    let options = newOptions;
    if (needsOptions && optionDraft.trim()) {
      const parts = optionDraft
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
        .filter((o) => !options.includes(o));
      options = [...options, ...parts];
    }
    if (needsOptions && options.length === 0) {
      setError("Add at least one option for Select fields.");
      return;
    }

    const body: Record<string, unknown> = { name: newName.trim(), type: newType };
    if (needsOptions) body.options = options;

    const res = await fetch(`/api/projects/${projectId}/custom-fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error || "Couldn't create field.");
      return;
    }

    resetForm();
    fetchFields();
  }

  async function deleteField(fieldId: string) {
    await fetch(`/api/projects/${projectId}/custom-fields`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fieldId }),
    });
    fetchFields();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Custom Fields</h3>
        <Button size="sm" variant="ghost" onClick={() => setAdding(!adding)} className="text-xs h-7">
          <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Field
        </Button>
      </div>

      {fields.map(field => (
        <div key={field.id} className="flex items-center gap-2 text-sm group border rounded-md px-3 py-2">
          <span className="flex-1 font-medium">{field.name}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{field.type}</span>
          <button
            onClick={() => deleteField(field.id)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1"
            type="button"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}

      {adding && (
        <div className="border rounded-md p-3 space-y-2">
          <Input
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Field name"
            className="text-sm h-8"
          />
          <Select
            value={newType}
            onValueChange={(v) => {
              if (!v) return;
              setNewType(v);
              setError(null);
            }}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue>{TYPE_LABELS[newType] ?? newType}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="select">Select</SelectItem>
              <SelectItem value="multi_select">Multi Select</SelectItem>
            </SelectContent>
          </Select>
          {(newType === "select" || newType === "multi_select") && (
            <div className="space-y-2">
              {newOptions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {newOptions.map((opt) => (
                    <span
                      key={opt}
                      className="inline-flex items-center gap-1 text-xs bg-muted rounded-full pl-2 pr-1 py-0.5"
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() =>
                          setNewOptions((prev) => prev.filter((o) => o !== opt))
                        }
                        className="text-muted-foreground hover:text-destructive rounded-full px-1"
                        aria-label={`Remove ${opt}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                value={optionDraft}
                onChange={(e) => {
                  setOptionDraft(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitOptionDraft();
                  }
                }}
                onBlur={commitOptionDraft}
                placeholder="Type an option, press Enter or comma to add"
                className="text-sm h-8"
              />
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={addField} className="h-7 text-xs">Create</Button>
            <Button size="sm" variant="ghost" onClick={resetForm} className="h-7 text-xs">Cancel</Button>
          </div>
        </div>
      )}

      {fields.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">No custom fields defined</p>
      )}
    </div>
  );
}
