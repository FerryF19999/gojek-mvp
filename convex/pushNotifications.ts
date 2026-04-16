"use node";

import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

const STATUS_MESSAGES: Record<string, string> = {
  assigned: "Driver ditemukan! Driver menuju lokasi kamu",
  driver_arriving: "Driver hampir sampai!",
  picked_up: "Perjalanan dimulai!",
  completed: "Perjalanan selesai. Silakan bayar.",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://gojek-mvp.vercel.app";

function setupVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails("mailto:support@nemuojek.local", publicKey, privateKey);
  return true;
}

export const sendRideStatusPush = internalAction({
  args: {
    rideCode: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const body = STATUS_MESSAGES[args.status];
    if (!body) return;

    if (!setupVapid()) {
      console.warn("[push] Missing VAPID env, skipping push notifications");
      return;
    }

    const subscriptions = await ctx.runQuery((api as any).pushSubscriptions.listByRideCode, {
      rideCode: args.rideCode,
    });

    if (!subscriptions.length) return;

    const payload = JSON.stringify({
      title: "NEMU RIDE",
      body,
      url: `/track/${args.rideCode}`,
      rideCode: args.rideCode,
      status: args.status,
    });

    // Send Telegram status update to passenger if they have a Telegram session
    const passengerState = await ctx.runQuery((api as any).passengerTelegram.getByRideCode, {
      rideCode: args.rideCode,
    });

    if (passengerState?.chatId) {
      const text = `${body}\nTrack: ${APP_URL}/track/${args.rideCode}`;
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      if (telegramToken) {
        try {
          await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: passengerState.chatId, text }),
          });
        } catch (e) {
          console.warn("[push] Failed sending Telegram status update", e);
        }
      }
    }

    await Promise.all(
      subscriptions.map(async (sub: any) => {
        try {
          await webpush.sendNotification(sub.subscription as any, payload);
        } catch (error: any) {
          if (error?.statusCode === 404 || error?.statusCode === 410) {
            await ctx.runMutation((api as any).pushSubscriptions.remove, {
              rideCode: args.rideCode,
              endpoint: sub.endpoint,
            });
          }
        }
      }),
    );
  },
});
