"use client";

import { useEffect, useState, use } from "react";
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

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "checkbox";

type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string | null;
  mapsTo: string | null;
  position: number;
};

type Form = {
  id: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  fields: FormField[];
};

export default function PublicFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ taskId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load without auth — public endpoint via form submit; we need a public GET.
    // Since the /api/forms/[id] route requires auth, we fetch it via submit's
    // form data path. We'll hit a public-safe path by calling the submit
    // endpoint's counterpart: fetch the form via a separate GET route.
    // Instead, we inline a quick read via submit OPTIONS is not standard.
    // Use a dedicated public read: piggyback on /api/forms/[id]/submit via GET.
    fetch(`/api/f/${id}`)
      .then(async (r) => {
        if (r.status === 404) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setForm(data);
        setLoading(false);
      })
      .catch(() => {
        setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    setError(null);

    // Validate required
    for (const field of form.fields) {
      if (field.required) {
        const v = values[field.id];
        if (v === undefined || v === null || v === "" || v === false) {
          setError(`Please fill in "${field.label}"`);
          setSubmitting(false);
          return;
        }
      }
    }

    const data: Record<string, unknown> = {};
    for (const field of form.fields) {
      data[field.id] = values[field.id] ?? "";
    }

    const res = await fetch(`/api/forms/${id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data,
        submitterName: submitterName || null,
        submitterEmail: submitterEmail || null,
      }),
    });
    if (res.ok) {
      const body = await res.json();
      setSuccess({ taskId: body.taskId });
    } else {
      const body = await res.json();
      setError(body.error || "Failed to submit");
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground">Loading form...</p>
      </div>
    );
  }

  if (notFound || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Form not found</CardTitle>
            <CardDescription>
              This form does not exist or is no longer accepting submissions.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Thanks — we got it!</CardTitle>
            <CardDescription>
              Your request has been received. The team will follow up
              {submitterEmail ? " by email" : " if you shared contact info"}.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 flex items-start justify-center">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <CardTitle>{form.title}</CardTitle>
          {form.description && (
            <CardDescription>{form.description}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.map((field) => (
              <div key={field.id} className="space-y-1">
                <label className="text-sm font-medium">
                  {field.label}
                  {field.required && (
                    <span className="text-destructive ml-1">*</span>
                  )}
                </label>
                {field.type === "text" && (
                  <Input
                    value={(values[field.id] as string) || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.value }))
                    }
                    required={field.required}
                  />
                )}
                {field.type === "textarea" && (
                  <Textarea
                    value={(values[field.id] as string) || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.value }))
                    }
                    required={field.required}
                  />
                )}
                {field.type === "number" && (
                  <Input
                    type="number"
                    value={(values[field.id] as string) || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.value }))
                    }
                    required={field.required}
                  />
                )}
                {field.type === "date" && (
                  <Input
                    type="date"
                    value={(values[field.id] as string) || ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.value }))
                    }
                    required={field.required}
                  />
                )}
                {field.type === "checkbox" && (
                  <input
                    type="checkbox"
                    checked={(values[field.id] as boolean) || false}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        [field.id]: e.target.checked,
                      }))
                    }
                    className="ml-1"
                  />
                )}
                {field.type === "select" && (
                  <Select
                    value={(values[field.id] as string) || ""}
                    onValueChange={(v) =>
                      v &&
                      setValues((prev) => ({ ...prev, [field.id]: v }))
                    }
                  >
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

            <div className="pt-2 border-t space-y-3">
              <p className="text-xs text-muted-foreground">
                Optional — helps the team follow up with you.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Your name</label>
                  <Input
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Your email</label>
                  <Input
                    type="email"
                    value={submitterEmail}
                    onChange={(e) => setSubmitterEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
