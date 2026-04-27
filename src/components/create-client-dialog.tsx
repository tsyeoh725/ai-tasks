"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const INDUSTRIES = [
  "Advertising & Marketing",
  "Architecture & Interior Design",
  "Automotive",
  "Construction & Property",
  "E-commerce & Retail",
  "Education & Training",
  "Events & Entertainment",
  "Fashion & Lifestyle",
  "Finance & Insurance",
  "Food & Beverage",
  "Healthcare & Wellness",
  "Hospitality & Tourism",
  "Legal & Consulting",
  "Logistics & Transport",
  "Manufacturing",
  "Media & Publishing",
  "NGO & Non-profit",
  "Professional Services",
  "Real Estate",
  "Technology & SaaS",
  "Other",
];

const SERVICES = [
  { value: "social_media", label: "Social Media" },
  { value: "seo", label: "SEO" },
  { value: "paid_ads", label: "Paid Ads" },
  { value: "branding", label: "Branding & Identity" },
  { value: "web_design", label: "Web Design" },
  { value: "content", label: "Content Writing" },
  { value: "email_marketing", label: "Email Marketing" },
  { value: "pr", label: "PR & Media" },
  { value: "video", label: "Video Production" },
  { value: "strategy", label: "Strategy & Consulting" },
  { value: "analytics", label: "Analytics & Reporting" },
  { value: "photography", label: "Photography" },
  { value: "copywriting", label: "Copywriting" },
];

const PAYMENT_TERMS = [
  { value: "upon_receipt", label: "Due Upon Receipt" },
  { value: "net_7", label: "Net 7" },
  { value: "net_14", label: "Net 14" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "50_50", label: "50% upfront, 50% on delivery" },
  { value: "monthly", label: "Monthly retainer" },
];

type Props = {
  onCreated?: (client: { id: string; name: string }) => void;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CreateClientDialog({ onCreated, trigger, open: openProp, onOpenChange }: Props) {
  const { success, error } = useToast();

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "contact" | "billing">("basic");

  // Basic
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [status, setStatus] = useState("onboarding");
  const [notes, setNotes] = useState("");
  const [brandColor, setBrandColor] = useState("#99ff33");

  // Contact
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [website, setWebsite] = useState("");

  // Billing
  const [paymentTerms, setPaymentTerms] = useState("net_30");
  const [monthlyRetainer, setMonthlyRetainer] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [taxId, setTaxId] = useState("");
  const [billingAddress, setBillingAddress] = useState("");

  function reset() {
    setName(""); setIndustry(""); setServices([]); setStatus("onboarding");
    setNotes(""); setBrandColor("#99ff33");
    setContactName(""); setContactEmail(""); setContactPhone(""); setWhatsapp(""); setWebsite("");
    setPaymentTerms("net_30"); setMonthlyRetainer(""); setCurrency("MYR"); setTaxId(""); setBillingAddress("");
    setActiveTab("basic");
  }

  function toggleService(val: string) {
    setServices((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const customFields: Record<string, string> = {};
      if (paymentTerms) customFields.paymentTerms = paymentTerms;
      if (monthlyRetainer) customFields.monthlyRetainer = monthlyRetainer;

      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          industry: industry || null,
          services,
          status,
          notes: notes.trim() || null,
          brandColor,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          website: website.trim() || null,
          currency,
          taxId: taxId.trim() || null,
          billingAddress: billingAddress.trim() || null,
          customFields,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        error({ title: data.error || "Failed to create client" });
        return;
      }

      const created = await res.json();
      success({ title: `${name} added as a client` });
      onCreated?.(created);
      reset();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const TAB_CLASSES = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded transition-colors ${
      active ? "bg-white dark:bg-white/10 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
    }`;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      {!isControlled && (
        <DialogTrigger
          render={trigger
            ? (props) => React.cloneElement(trigger as React.ReactElement, props)
            : <Button size="sm" className="btn-brand gap-1.5" />
          }
        >
          {!trigger && <><Plus size={14} /> New Client</>}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Client</DialogTitle>
        </DialogHeader>

        {/* Tab strip */}
        <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
          {(["basic", "contact", "billing"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={TAB_CLASSES(activeTab === t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pb-2">

          {activeTab === "basic" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cl-name">Company / Client Name <span className="text-red-500">*</span></Label>
                <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Acme Corp" />
              </div>

              <div className="space-y-1.5">
                <Label>Industry</Label>
                <Select value={industry} onValueChange={(v) => v && setIndustry(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRIES.map((i) => (
                      <SelectItem key={i} value={i}>{i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Onboarding Status</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onboarding">Onboarding</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Services</Label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggleService(s.value)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        services.includes(s.value)
                          ? "bg-[#99ff33]/20 border-[#99ff33] text-[#2d5200] dark:text-[#99ff33]"
                          : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/50"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Brand Color</Label>
                <div className="flex items-center gap-3">
                  <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-8 w-14 rounded border cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{brandColor}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cl-notes">Notes</Label>
                <Textarea id="cl-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, background, special requirements..." rows={3} />
              </div>
            </>
          )}

          {activeTab === "contact" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="cl-cname">Contact Person</Label>
                <Input id="cl-cname" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-email">Email</Label>
                <Input id="cl-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@company.com" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-phone">Phone</Label>
                  <Input id="cl-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+60 12-345 6789" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-wa">WhatsApp</Label>
                  <Input id="cl-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+60 12-345 6789" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-web">Website</Label>
                <Input id="cl-web" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://company.com" />
              </div>
            </>
          )}

          {activeTab === "billing" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MYR">MYR — Ringgit</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="SGD">SGD — Singapore Dollar</SelectItem>
                      <SelectItem value="GBP">GBP — Pound</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="AUD">AUD — Australian Dollar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Terms</Label>
                  <Select value={paymentTerms} onValueChange={(v) => v && setPaymentTerms(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cl-retainer">Monthly Retainer ({currency})</Label>
                <Input
                  id="cl-retainer"
                  type="number"
                  min="0"
                  step="100"
                  value={monthlyRetainer}
                  onChange={(e) => setMonthlyRetainer(e.target.value)}
                  placeholder="e.g. 5000"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cl-tax">SST / Tax ID</Label>
                <Input id="cl-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="SST No. / Tax ID" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cl-addr">Billing Address</Label>
                <Textarea id="cl-addr" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Street, City, State, Postcode, Country" rows={3} />
              </div>
            </>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              className="flex-1 btn-brand"
              disabled={saving || !name.trim()}
            >
              {saving ? "Creating…" : "Create Client"}
            </Button>
            {activeTab !== "billing" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveTab(activeTab === "basic" ? "contact" : "billing")}
              >
                Next →
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
