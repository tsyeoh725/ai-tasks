"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RecurrenceRule = {
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
};

type Props = {
  value: RecurrenceRule | null;
  onChange: (rule: RecurrenceRule | null) => void;
};

export function RecurrencePicker({ value, onChange }: Props) {
  const [editing, setEditing] = useState(false);

  if (!editing && !value) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="text-xs">
        <svg className="h-3.5 w-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Set recurrence
      </Button>
    );
  }

  if (!editing && value) {
    const label = `Every ${value.interval > 1 ? value.interval + " " : ""}${value.frequency.replace("ly", "")}${value.interval > 1 ? "s" : ""}`;
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm flex items-center gap-1.5">
          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {label}
        </span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-6 px-1.5 text-xs">
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => { onChange(null); setEditing(false); }}
          className="h-6 px-1.5 text-xs text-destructive"
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Every</span>
      <input
        type="number"
        min={1}
        max={99}
        defaultValue={value?.interval || 1}
        className="w-14 h-7 rounded border bg-background px-2 text-sm"
        onChange={(e) => {
          const interval = parseInt(e.target.value) || 1;
          onChange({ frequency: value?.frequency || "weekly", interval });
        }}
      />
      <Select
        defaultValue={value?.frequency || "weekly"}
        onValueChange={(v) => {
          onChange({ frequency: v as RecurrenceRule["frequency"], interval: value?.interval || 1 });
        }}
      >
        <SelectTrigger className="w-24 h-7 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">day(s)</SelectItem>
          <SelectItem value="weekly">week(s)</SelectItem>
          <SelectItem value="monthly">month(s)</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">
        Done
      </Button>
    </div>
  );
}
