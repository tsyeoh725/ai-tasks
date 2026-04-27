"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type Status = "unsupported" | "denied" | "unsubscribed" | "subscribed" | "loading";

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setStatus(sub ? "subscribed" : "unsubscribed");
      } catch (err) {
        console.error("[push] sw register failed:", err);
        if (!cancelled) setStatus("unsupported");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const vapidRes = await fetch("/api/push/vapid");
      if (!vapidRes.ok) {
        toast.error("Push isn't configured on the server");
        return;
      }
      const { publicKey } = await vapidRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const saveRes = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!saveRes.ok) {
        await sub.unsubscribe().catch(() => {});
        toast.error("Couldn't save subscription");
        return;
      }
      setStatus("subscribed");
      toast.success("Push notifications enabled");
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      toast.error("Couldn't enable push");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setStatus("unsubscribed");
      toast.info("Push notifications disabled");
    } catch (err) {
      console.error("[push] unsubscribe failed:", err);
      toast.error("Couldn't disable push");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return null;
  if (status === "unsupported") {
    return (
      <span className="text-xs text-gray-400">Push not supported</span>
    );
  }
  if (status === "denied") {
    return (
      <span className="text-xs text-gray-400" title="Enable notifications in browser settings">
        Notifications blocked
      </span>
    );
  }

  const subscribed = status === "subscribed";
  return (
    <button
      type="button"
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-2 py-1 transition-colors",
        subscribed
          ? "text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10"
          : "text-gray-500 hover:text-gray-800 hover:bg-gray-100",
        busy && "opacity-60 cursor-wait",
      )}
      title={subscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : subscribed ? (
        <Bell className="h-3.5 w-3.5" />
      ) : (
        <BellOff className="h-3.5 w-3.5" />
      )}
      {subscribed ? "Push on" : "Enable push"}
    </button>
  );
}
