"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WidgetType =
  | "column"
  | "line"
  | "donut"
  | "number"
  | "lollipop"
  | "burnup";

export type WidgetSource = "tasks" | "projects" | "portfolios" | "goals";

export type WidgetAggregation = "count" | "sum" | "avg";

export type WidgetFilter = { field: string; op: string; value: unknown };

export type Widget = {
  id: string;
  type: WidgetType;
  source: WidgetSource;
  title: string;
  xAxis?: string;
  yAxis?: string;
  aggregation: WidgetAggregation;
  groupBy?: string;
  filters?: WidgetFilter[];
  width: number;
  height: number;
};

type Props = {
  reportId: string;
  widget: Widget;
  onEdit?: (widget: Widget) => void;
};

type NumberPayload = { value: number };
type SeriesPayload = { data: Array<{ label: string; value: number }> };
type BurnupPayload = {
  data: Array<{ date: string; completed: number; total: number }>;
};

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#3b82f6",
  "#14b8a6",
];

export function ReportWidget({ reportId, widget, onEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<
    Array<{ label: string; value: number }>
  >([]);
  const [numberValue, setNumberValue] = useState<number | null>(null);
  const [burnupData, setBurnupData] = useState<
    Array<{ date: string; completed: number; total: number }>
  >([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widget }),
      });
      if (!res.ok) {
        throw new Error(`Failed (${res.status})`);
      }
      const payload = await res.json();
      if (widget.type === "number") {
        setNumberValue((payload as NumberPayload).value ?? 0);
      } else if (widget.type === "burnup") {
        setBurnupData((payload as BurnupPayload).data ?? []);
      } else {
        setSeriesData((payload as SeriesPayload).data ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [reportId, widget]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full min-h-[180px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full min-h-[180px]">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      );
    }

    if (widget.type === "number") {
      const val = numberValue ?? 0;
      const display = Number.isInteger(val)
        ? val.toString()
        : val.toFixed(2);
      return (
        <div className="flex items-center justify-center h-full min-h-[180px]">
          <span className="text-4xl font-bold">{display}</span>
        </div>
      );
    }

    if (widget.type === "burnup") {
      if (burnupData.length === 0) {
        return (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No data
          </p>
        );
      }
      return (
        <div className="h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={burnupData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="date"
                fontSize={11}
                interval="preserveStartEnd"
                tickCount={6}
              />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                name="Total"
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="Completed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (seriesData.length === 0) {
      return (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No data
        </p>
      );
    }

    if (widget.type === "column") {
      return (
        <div className="h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seriesData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {seriesData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.type === "line") {
      return (
        <div className="h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={seriesData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.type === "donut") {
      return (
        <div className="h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={seriesData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
              >
                {seriesData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (widget.type === "lollipop") {
      return (
        <div className="h-full min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={seriesData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="value" barSize={3} fill="#6366f1" />
              <Scatter dataKey="value" fill="#6366f1">
                {seriesData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 text-sm text-card-foreground ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading text-base leading-snug font-medium truncate">
          {widget.title || "Untitled widget"}
        </h3>
        {onEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onEdit(widget)}
            aria-label="Edit widget"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0">{renderBody()}</div>
    </div>
  );
}
