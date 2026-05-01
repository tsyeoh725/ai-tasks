"use client";

import { use, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CsvRow = {
  title: string;
  status?: string;
  priority?: string;
  assigneeEmail?: string;
  dueDate?: string;
  description?: string;
  labels?: string;
};

type ParseResult = {
  rows: CsvRow[];
  headers: string[];
  errors: string[];
};

type ImportResult = {
  created: number;
  failed: Array<{ row: number; reason: string }>;
};

const KNOWN_FIELDS: (keyof CsvRow)[] = [
  "title",
  "status",
  "priority",
  "assigneeEmail",
  "dueDate",
  "description",
  "labels",
];

// Map common header spellings (case-insensitive) to CsvRow keys.
const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  title: "title",
  name: "title",
  task: "title",
  status: "status",
  priority: "priority",
  assignee: "assigneeEmail",
  "assignee email": "assigneeEmail",
  assigneeemail: "assigneeEmail",
  email: "assigneeEmail",
  "due date": "dueDate",
  duedate: "dueDate",
  due: "dueDate",
  description: "description",
  notes: "description",
  labels: "labels",
  tags: "labels",
};

function normalizeHeader(h: string): keyof CsvRow | null {
  const key = h.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? null;
}

function parseCsv(text: string): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows: CsvRow[] = [];
  const errors: string[] = [];
  const originalHeaders = (parsed.meta.fields || []).map((h) => h);

  for (const p of parsed.errors) {
    errors.push(`${p.type}: ${p.message}`);
  }

  for (const raw of parsed.data) {
    const out: CsvRow = { title: "" };
    for (const [k, v] of Object.entries(raw)) {
      const mapped = normalizeHeader(k);
      if (!mapped) continue;
      const value = (v ?? "").toString().trim();
      if (value.length === 0) continue;
      out[mapped] = value;
    }
    rows.push(out);
  }

  return { rows, headers: originalHeaders, errors };
}

export default function ImportCsvPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFilePick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    setParseResult(parsed);
    // Reset input so picking the same file again still fires change
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImport() {
    if (!parseResult || parseResult.rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/import-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parseResult.rows }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Import failed (${res.status})`);
      } else {
        const data = (await res.json()) as ImportResult;
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const previewRows = parseResult?.rows.slice(0, 20) ?? [];
  const totalRows = parseResult?.rows.length ?? 0;
  const validRows =
    parseResult?.rows.filter((r) => r.title && r.title.length > 0).length ?? 0;
  const hasFile = !!parseResult;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.push(`/projects/${id}`)}
          className="text-sm text-muted-foreground hover:text-foreground mb-2"
          type="button"
        >
          {"\u2190"} Back to project
        </button>
        <h1 className="text-2xl font-bold">Import tasks from CSV</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a CSV file with columns like Title, Status, Priority,
          Assignee Email, Due Date, Description, Labels. Only Title is
          required — other columns use defaults when missing.
        </p>
      </div>

      {/* Upload area */}
      <div
        className={cn(
          "rounded-lg border-2 border-dashed border-border p-8 flex flex-col items-center justify-center text-center",
          hasFile && "border-solid bg-muted/30",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
        {!hasFile && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              CSV, UTF-8. First row is the header.
            </p>
            <Button onClick={handleFilePick} type="button">
              Upload CSV
            </Button>
          </>
        )}
        {hasFile && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium">{fileName}</span>
            <span className="text-muted-foreground">
              {totalRows} row{totalRows === 1 ? "" : "s"} parsed
              {validRows !== totalRows && (
                <> ({validRows} valid)</>
              )}
            </span>
            <Button
              onClick={handleFilePick}
              type="button"
              variant="ghost"
              size="sm"
            >
              Change file
            </Button>
          </div>
        )}
      </div>

      {/* Parse errors */}
      {parseResult && parseResult.errors.length > 0 && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive mb-1">
            Parse warnings
          </p>
          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
            {parseResult.errors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {parseResult.errors.length > 5 && (
              <li>...and {parseResult.errors.length - 5} more</li>
            )}
          </ul>
        </div>
      )}

      {/* Preview */}
      {parseResult && parseResult.rows.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">
              Preview{" "}
              <span className="text-muted-foreground font-normal">
                (showing {previewRows.length} of {totalRows})
              </span>
            </h2>
            <Button
              onClick={handleImport}
              disabled={importing || validRows === 0}
              type="button"
            >
              {importing
                ? "Importing..."
                : `Import ${validRows} task${validRows === 1 ? "" : "s"}`}
            </Button>
          </div>
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  {KNOWN_FIELDS.map((f) => (
                    <th
                      key={f}
                      className="px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr
                    key={i}
                    className={cn(
                      "border-b",
                      !row.title && "bg-destructive/5",
                    )}
                  >
                    {KNOWN_FIELDS.map((f) => (
                      <td
                        key={f}
                        className={cn(
                          "px-3 py-2 text-xs align-top max-w-[200px] truncate",
                          f === "title" && !row[f] && "text-destructive",
                        )}
                        title={row[f]}
                      >
                        {row[f] || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validRows < totalRows && (
            <p className="mt-2 text-xs text-muted-foreground">
              {totalRows - validRows} row
              {totalRows - validRows === 1 ? "" : "s"} missing a title will be
              skipped.
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium">
              Imported {result.created} task
              {result.created === 1 ? "" : "s"}
            </p>
            {result.failed.length > 0 && (
              <p className="text-sm text-destructive">
                ({result.failed.length} failed)
              </p>
            )}
          </div>
          {result.failed.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 max-h-48 overflow-auto">
              <p className="text-xs font-medium mb-1">Failures</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {result.failed.map((f, i) => (
                  <li key={i}>
                    Row {f.row + 1}: {f.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => router.push(`/projects/${id}`)}
              type="button"
              variant="outline"
              size="sm"
            >
              Back to project
            </Button>
            <Button
              onClick={() => {
                setParseResult(null);
                setFileName(null);
                setResult(null);
              }}
              type="button"
              variant="ghost"
              size="sm"
            >
              Import another file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
