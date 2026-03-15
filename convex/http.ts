import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
  path: "/webhooks/xendit",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const event = JSON.parse(body);
    const callbackToken = request.headers.get("x-callback-token");

    if (process.env.XENDIT_CALLBACK_TOKEN && callbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
      return new Response("invalid signature", { status: 401 });
    }

    const eventId = event?.id ?? event?.external_id ?? `evt_${Date.now()}`;
    const existing = await ctx.runQuery(internal.webhooks.isProcessed, { provider: "xendit", eventId });
    if (existing) return new Response("ok", { status: 200 });

    await ctx.runMutation(internal.webhooks.markProcessed, { provider: "xendit", eventId });

    const status = event?.status ?? event?.payment_status;
    if (status === "PAID" || status === "SUCCEEDED") {
      const providerRef = event?.id ?? event?.qr_code?.id;
      if (providerRef) {
        await ctx.runMutation(internal.payments.markPaidInternal, { providerRef, payload: body });
      }
    }

    return new Response("ok", { status: 200 });
  }),
});

export default http;
