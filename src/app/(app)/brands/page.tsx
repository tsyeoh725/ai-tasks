"use client";

import { useCallback, useEffect, useState } from "react";
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
    cplMax: number | null;
    ctrMin: number | null;
    frequencyMax: number | null;
  };
  toggles: {
    killEnabled: boolean;
    budgetEnabled: boolean;
    duplicateEnabled: boolean;
  };
  preferences: string[];
  insightsDateRange: number;
  costMetric?: { label: string; actionType: string };
  spendLimit?: {
    monthlyLimit: number | null;
    dailyLimit: number | null;
    alertThreshold: number;
    pauseOnLimit: boolean;
  };
};

type Brand = {
  id: string;
  name: string;
  metaAccountId: string;
  config: BrandConfig;
  isActive: boolean;
  projectId?: string | null;
};

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      const data = await res.json();
      setBrands(Array.isArray(data) ? data : data.brands || []);
    } catch {
      // noop
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount; not migrating to Suspense
    fetchBrands();
  }, [fetchBrands]);

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
        body: JSON.stringify({ name, metaAccountId: accountId }),
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
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Brands
          </h1>
          <p className="text-sm text-gray-500 mt-1">
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
                <p className="text-xs text-gray-400 mt-1.5">
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
              className="h-36 rounded-2xl bg-gray-50 border border-gray-200 animate-pulse"
            />
          ))}
        </div>
      ) : brands.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No brands yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Click &ldquo;Add Brand&rdquo; to get started
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brands.map((brand) => (
            <Link key={brand.id} href={`/brands/${brand.id}`} className="block">
              <Card className="h-full hover:bg-gray-50 transition-colors cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="truncate">{brand.name}</CardTitle>
                    <Badge variant={brand.isActive ? "success" : "secondary"}>
                      {brand.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 font-mono truncate">
                    {brand.metaAccountId}
                  </p>
                  {brand.config?.spendLimit?.monthlyLimit && (
                    <p className="text-xs text-gray-500 mt-1 font-mono">
                      RM {brand.config.spendLimit.monthlyLimit.toLocaleString()}/mo
                    </p>
                  )}
                  <div className="mt-3 flex gap-1.5 flex-wrap">
                    {brand.config?.toggles?.killEnabled && (
                      <Badge variant="destructive">Kill</Badge>
                    )}
                    {brand.config?.toggles?.budgetEnabled && (
                      <Badge variant="default">Budget</Badge>
                    )}
                    {brand.config?.toggles?.duplicateEnabled && (
                      <Badge variant="secondary">Duplicate</Badge>
                    )}
                    {brand.config?.spendLimit?.pauseOnLimit && (
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
