"use client";

import { useEffect } from "react";
import { urlBase64ToUint8Array } from "@/lib/push";

export default function PushSubscriber({ rideCode }: { rideCode: string }) {
  useEffect(() => {
    const subscribe = async () => {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.warn("[push] Browser tidak support Web Push API");
        return;
      }

      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.warn("[push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        return;
      }

      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideCode, subscription: sub.toJSON() }),
      });
    };

    subscribe().catch((err) => console.warn("[push] subscribe failed", err));
  }, [rideCode]);

  return null;
}
