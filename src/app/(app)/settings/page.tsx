"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useConfirm } from "@/components/ui/confirm-dialog";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6 animate-fade-in">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <p className="text-sm">{session?.user?.name}</p>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <p className="text-sm">{session?.user?.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar */}
      <CalendarSection />

      {/* Work Hours */}
      <WorkHoursSection />

      {/* Meta Ads */}
      <MetaAdsSection />

      {/* Monitor Schedule */}
      <MonitorScheduleSection />

      {/* Telegram */}
      <TelegramSection />

      {/* API Keys */}
      <ApiKeysSection />
    </div>
  );
}

function CalendarSection() {
  const confirm = useConfirm();
  const [status, setStatus] = useState<{
    connected: boolean;
    email?: string;
    lastSyncedAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/calendar/sync")
      .then((r) => r.json())
      .then((data) => setStatus({ connected: true, email: data.email, lastSyncedAt: data.lastSyncedAt }))
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect() {
    const res = await fetch("/api/calendar/connect");
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/calendar/sync", { method: "POST" });
      const res = await fetch("/api/calendar/sync");
      const data = await res.json();
      setStatus({ connected: true, email: data.email, lastSyncedAt: data.lastSyncedAt });
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    const ok = await confirm({
      title: "Disconnect Google Calendar?",
      description: "Scheduled blocks will no longer push to your calendar.",
      confirmLabel: "Disconnect",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch("/api/calendar/disconnect", { method: "DELETE" });
    setStatus({ connected: false });
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Calendar</CardTitle>
        <CardDescription>
          Connect your Google Calendar to sync events and schedule tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">Connected</span>
              {status.email && (
                <span className="text-sm text-muted-foreground">({status.email})</span>
              )}
            </div>
            {status.lastSyncedAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(status.lastSyncedAt).toLocaleString()}
              </p>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSync} disabled={syncing}>
                {syncing ? "Syncing..." : "Sync Now"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={handleConnect}>Connect Google Calendar</Button>
        )}
      </CardContent>
    </Card>
  );
}

function WorkHoursSection() {
  const [prefs, setPrefs] = useState({
    workStart: "09:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    workEnd: "17:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    focusTimePreference: "morning",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        setPrefs((prev) => ({
          workStart: data.workStart || prev.workStart,
          lunchStart: data.lunchStart || prev.lunchStart,
          lunchEnd: data.lunchEnd || prev.lunchEnd,
          workEnd: data.workEnd || prev.workEnd,
          timezone: data.timezone || prev.timezone,
          focusTimePreference: data.focusTimePreference || prev.focusTimePreference,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Work Hours</CardTitle>
        <CardDescription>
          Configure your working hours and focus time preferences
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Work Start</Label>
            <Input
              type="time"
              value={prefs.workStart}
              onChange={(e) => setPrefs((p) => ({ ...p, workStart: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Lunch Start</Label>
            <Input
              type="time"
              value={prefs.lunchStart}
              onChange={(e) => setPrefs((p) => ({ ...p, lunchStart: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Lunch End</Label>
            <Input
              type="time"
              value={prefs.lunchEnd}
              onChange={(e) => setPrefs((p) => ({ ...p, lunchEnd: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Work End</Label>
            <Input
              type="time"
              value={prefs.workEnd}
              onChange={(e) => setPrefs((p) => ({ ...p, workEnd: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Timezone</Label>
          <Input
            value={prefs.timezone}
            onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Focus Time Preference</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={prefs.focusTimePreference}
            onChange={(e) => setPrefs((p) => ({ ...p, focusTimePreference: e.target.value }))}
          >
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TelegramSection() {
  const confirm = useConfirm();
  const [telegramStatus, setTelegramStatus] = useState<{
    linked: boolean;
    username: string | null;
    code?: string;
    botUsername?: string;
  }>({ linked: false, username: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/telegram/link")
      .then((r) => r.json())
      .then(setTelegramStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleLink() {
    const res = await fetch("/api/telegram/link", { method: "POST" });
    const data = await res.json();
    setTelegramStatus((prev) => ({ ...prev, code: data.code, botUsername: data.botUsername }));
  }

  async function handleUnlink() {
    const ok = await confirm({
      title: "Unlink Telegram?",
      description: "You'll stop receiving approval prompts via Telegram.",
      confirmLabel: "Unlink",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch("/api/telegram/link", { method: "DELETE" });
    setTelegramStatus({ linked: false, username: null });
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Telegram</CardTitle>
        <CardDescription>
          Link your Telegram account for AI task chat and notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {telegramStatus.linked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">
                Linked to @{telegramStatus.username || "Telegram"}
              </span>
            </div>
            <Button variant="destructive" size="sm" onClick={handleUnlink}>
              Unlink Telegram
            </Button>
          </div>
        ) : telegramStatus.code ? (
          <div className="space-y-3">
            <p className="text-sm">
              Send this message to <strong>@{telegramStatus.botUsername}</strong> on Telegram:
            </p>
            <code className="block bg-muted p-3 rounded text-sm font-mono">
              /start {telegramStatus.code}
            </code>
            <p className="text-xs text-muted-foreground">This code expires in 10 minutes.</p>
          </div>
        ) : (
          <Button onClick={handleLink}>Link Telegram</Button>
        )}
      </CardContent>
    </Card>
  );
}

function MetaAdsSection() {
  const [token, setToken] = useState("");
  const [masked, setMasked] = useState<string | null>(null);
  const [connectedBrands, setConnectedBrands] = useState<
    { id: string; name: string; metaAccountId: string; isActive: boolean }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/marketing/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings || {};
        if (typeof s.meta_access_token_masked === "string") {
          setMasked(s.meta_access_token_masked);
        }
        setConnectedBrands(data?.brands || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/marketing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meta_access_token: token }),
      });
      if (res.ok) {
        setMasked(`${token.slice(0, 4)}…${token.slice(-4)}`);
        setToken("");
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/marketing/test-meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token } : {}),
      });
      const data = await res.json();
      setTestResult({
        ok: !!data?.ok,
        message: data?.ok ? "Connected successfully" : data?.error || "Test failed",
      });
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meta Ads</CardTitle>
        <CardDescription>
          Connect your Facebook Marketing API access token.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Meta Access Token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={masked ? `Saved: ${masked}` : "Paste your access token"}
          />
          {masked && !token && (
            <p className="text-xs text-muted-foreground">
              A token is saved ({masked}). Enter a new one to replace it.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleTest} disabled={testing} variant="outline">
            {testing ? "Testing..." : "Test connection"}
          </Button>
          <Button onClick={handleSave} disabled={saving || !token}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        {testResult && (
          <p className={`text-sm ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
            {testResult.message}
          </p>
        )}
        <Separator />
        <div>
          <Label>Connected ad accounts</Label>
          {connectedBrands.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-2">No brands linked yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {connectedBrands.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      b.isActive ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                  <span>{b.name}</span>
                  <span className="text-xs text-muted-foreground">
                    (account {b.metaAccountId})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MonitorScheduleSection() {
  const [intervalHours, setIntervalHours] = useState<number>(6);
  const [reportDay, setReportDay] = useState<string>("mon");
  const [reportHour, setReportHour] = useState<number>(9);
  const [globalPause, setGlobalPause] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/marketing/settings")
      .then((r) => r.json())
      .then((data) => {
        const s = data?.settings || {};
        if (typeof s.monitor_interval_hours === "number") setIntervalHours(s.monitor_interval_hours);
        if (typeof s.weekly_report_day === "string") setReportDay(s.weekly_report_day);
        if (typeof s.weekly_report_hour === "number") setReportHour(s.weekly_report_hour);
        if (typeof s.global_pause === "boolean") setGlobalPause(s.global_pause);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/marketing/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitor_interval_hours: intervalHours,
          weekly_report_day: reportDay,
          weekly_report_hour: reportHour,
          global_pause: globalPause,
        }),
      });
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monitor Schedule</CardTitle>
        <CardDescription>
          Control how often the ad monitor runs and when the weekly report is sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Schedule interval (hours)</Label>
          <Input
            type="number"
            min={1}
            max={24}
            value={intervalHours}
            onChange={(e) => setIntervalHours(Number(e.target.value) || 6)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Weekly report day</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={reportDay}
              onChange={(e) => setReportDay(e.target.value)}
            >
              <option value="mon">Monday</option>
              <option value="tue">Tuesday</option>
              <option value="wed">Wednesday</option>
              <option value="thu">Thursday</option>
              <option value="fri">Friday</option>
              <option value="sat">Saturday</option>
              <option value="sun">Sunday</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Weekly report hour (0-23)</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={reportHour}
              onChange={(e) => setReportHour(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">Global pause</Label>
            <p className="text-xs text-muted-foreground">
              When on, the monitor will not execute any actions.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={globalPause}
            onClick={() => setGlobalPause((p) => !p)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              globalPause ? "bg-primary" : "bg-input"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition ${
                globalPause ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ApiKeysSection() {
  const confirm = useConfirm();
  const [keys, setKeys] = useState<{ id: string; name: string; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => r.json())
      .then((data) => setKeys(data.keys || []))
      .catch(() => {});
  }, []);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName.trim() }),
    });
    const data = await res.json();
    setGeneratedKey(data.key);
    setNewKeyName("");
    // Refresh list
    const listRes = await fetch("/api/keys");
    const listData = await listRes.json();
    setKeys(listData.keys || []);
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: "Delete API key?",
      description: `"${name}" will stop working immediately for any integration using it.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    await fetch(`/api/keys/${id}`, { method: "DELETE" });
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Keys</CardTitle>
        <CardDescription>
          Generate API keys for programmatic access via the OpenAPI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {generatedKey && (
          <div className="bg-green-50 dark:bg-green-950 p-3 rounded-md space-y-1">
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              API key created! Copy it now — it won&apos;t be shown again.
            </p>
            <code className="block text-xs font-mono bg-green-100 dark:bg-green-900 p-2 rounded">
              {generatedKey}
            </code>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g., 'My Integration')"
          />
          <Button onClick={handleCreate} disabled={!newKeyName.trim()}>
            Create
          </Button>
        </div>

        {keys.length > 0 && (
          <div className="space-y-2">
            {keys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-2 rounded border">
                <div>
                  <p className="text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(key.id, key.name)}>
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
