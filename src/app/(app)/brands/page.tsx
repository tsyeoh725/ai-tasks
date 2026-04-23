"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type BrandConfig = {
  thresholds: {
    cpl_max: number | null;
    ctr_min: number | null;
    frequency_max: number | null;
  };
  toggles: {
    kill_enabled: boolean;
    budget_enabled: boolean;
    duplicate_enabled: boolean;
  };
  preferences: string[];
  insights_date_range: number;
  cost_metric?: { label: string; action_type: string };
  spend_limit?: {
    monthly_limit: number | null;
    daily_limit: number | null;
    alert_threshold: number;
    pause_on_limit: boolean;
  };
};

type Brand = {
  id: string;
  name: string;
  meta_account_id: string;
  config: BrandConfig;
  is_active: boolean;
  project_id?: string | null;
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBrands();
  }, []);

  async function fetchBrands() {
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      setBrands(Array.isArray(data) ? data : data.brands || []);
    } catch {
      // noop
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!name || !accountId) {
      setError("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, meta_account_id: accountId }),
      });

      if (res.ok) {
        setOpen(false);
        setName("");
        setAccountId("");
        fetchBrands();
      } else {
        setError("Failed to create brand");
      }
    } catch {
      setError("Failed to create brand");
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
            Brands
          </h1>
          <p className="text-sm text-white/50 mt-1">
            Manage your Meta ad accounts and automation rules
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button variant="primary">
                <Plus />
                Add Brand
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Brand</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Brand Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Acme Corp"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Meta Ad Account ID</Label>
                <Input
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  placeholder="e.g., 123456789"
                  className="mt-1.5 font-mono"
                />
                <p className="text-xs text-white/40 mt-1.5">
                  Found in Meta Business Manager &rarr; Ad Accounts
                </p>
              </div>
              {error && (
                <p className="text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-2.5 py-2">
                  {error}
                </p>
              )}
              <Button
                onClick={handleCreate}
                disabled={submitting}
                variant="primary"
                className="w-full"
              >
                {submitting ? "Creating..." : "Create Brand"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
            />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="w-12 h-12 text-white/20 mb-3" />
            <p className="text-white/60">No brands yet</p>
            <p className="text-xs text-white/40 mt-1">
              Click &ldquo;Add Brand&rdquo; to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <Link key={brand.id} href={`/brands/${brand.id}`} className="block">
              <Card className="h-full hover:bg-white/[0.06] hover:border-white/[0.14] transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate">{brand.name}</CardTitle>
                    <Badge variant={brand.is_active ? "success" : "secondary"}>
                      {brand.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-white/50 font-mono truncate">
                    {brand.meta_account_id}
                  </p>
                  {brand.config?.spend_limit?.monthly_limit && (
                    <p className="text-xs text-white/50 mt-1 font-mono">
                      RM {brand.config.spend_limit.monthly_limit.toLocaleString()}/mo
                    </p>
                  )}
                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    {brand.config?.toggles?.kill_enabled && (
                      <Badge variant="destructive">Kill</Badge>
                    )}
                    {brand.config?.toggles?.budget_enabled && (
                      <Badge variant="default">Budget</Badge>
                    )}
                    {brand.config?.toggles?.duplicate_enabled && (
                      <Badge variant="secondary">Duplicate</Badge>
                    )}
                    {brand.config?.spend_limit?.pause_on_limit && (
                      <Badge variant="warning">Spend Cap</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
