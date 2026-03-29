import { internalAction, internalMutation, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isDriverSubscribed } from "./subscription";
import { haversineKm } from "./geo";

type AgentSpeed = "slow" | "normal" | "fast";

const STEP_DELAY_MS: Record<AgentSpeed, Record<"dispatching" | "assigned" | "awaiting_driver_response" | "driver_arriving" | "picked_up" | "completed", number>> = {
  slow: {
    dispatching: 6000,
    assigned: 8000,
    awaiting_driver_response: 5000,
    driver_arriving: 10000,
    picked_up: 10000,
    completed: 2000,
  },
  normal: {
    dispatching: 2500,
    assigned: 3500,
    awaiting_driver_response: 3000,
    driver_arriving: 4500,
    picked_up: 4500,
    completed: 1000,
  },
  fast: {
    dispatching: 1000,
    assigned: 1500,
    awaiting_driver_response: 1500,
    driver_arriving: 2000,
    picked_up: 2000,
    completed: 500,
  },
} as const;

const WAIT_DRIVER_RETRY_MS: Record<AgentSpeed, number> = {
  slow: 8000,
  normal: 4000,
  fast: 1500,
};

const WAIT_PAYMENT_RETRY_MS: Record<AgentSpeed, number> = {
  slow: 6000,
  normal: 3000,
  fast: 1200,
};

const nextStep = {
  dispatching: "assigned",
  assigned: "awaiting_driver_response",
  awaiting_driver_response: "driver_arriving",
  driver_arriving: "picked_up",
  picked_up: "completed",
  completed: null,
} as const;

const DRIVER_RESPONSE_TIMEOUT_MS = 30000; // 30s for demo

const resolveSpeed = (speed: unknown): AgentSpeed => {
  if (speed === "slow" || speed === "fast") return speed;
  return "normal";
};

async function logRideAgentAction(ctx: any, args: { rideId: any; actionType: string; input: unknown; output: unknown }) {
  await ctx.db.insert("agent_actions", {
    rideId: args.rideId,
    agentName: "ride_agent",
    actionType: args.actionType,
    input: JSON.stringify(args.input),
    output: JSON.stringify(args.output),
    approvedBy: "system-ride-agent",
    createdAt: Date.now(),
  });
}

const STATUS_ORDER = ["created", "awaiting_payment", "dispatching", "assigned", "awaiting_driver_response", "driver_arriving", "picked_up", "completed"] as const;

function statusIndex(s: string) {
  const idx = STATUS_ORDER.indexOf(s as any);
  return idx === -1 ? 999 : idx;
}

async function updateRideStatus(ctx: any, ride: any, status: any, note: string) {
  const now = Date.now();
  // Don't regress status — if ride is already at or past this status, skip
  if (statusIndex(ride.status) >= statusIndex(status)) {
    await ctx.db.patch(ride._id, {
      lastStepAt: now,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.patch(ride._id, {
    status,
    lastStepAt: now,
    updatedAt: now,
    timeline: [...ride.timeline, { type: status, at: now, by: "ride-agent", note }],
  });

  if (["assigned", "driver_arriving", "picked_up", "completed"].includes(status)) {
    await ctx.scheduler.runAfter(0, (internal as any).pushNotifications.sendRideStatusPush, {
      rideCode: ride.code,
      status,
    });
  }
}

export const startRideAgent = mutation({
  args: {
    rideId: v.id("rides"),
    speed: v.optional(v.union(v.literal("slow"), v.literal("normal"), v.literal("fast"))),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    if (ride.agentStatus === "running" && ride.agentRunId) {
      return { ok: true, alreadyRunning: true, runId: ride.agentRunId, speed: resolveSpeed(ride.agentSpeed) };
    }

    if (ride.assignedDriverId) {
      const assignedDriver = await ctx.db.get(ride.assignedDriverId);
      if (!assignedDriver || !isDriverSubscribed(assignedDriver, Date.now())) {
        throw new Error("Assigned driver subscription is inactive. Ride agent cannot be started.");
      }
    }

    for (const jobId of ride.agentJobIds ?? []) {
      await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">).catch(() => null);
    }

    const now = Date.now();
    const runId = `${String(args.rideId)}-${now}`;
    const speed = resolveSpeed(args.speed ?? ride.agentSpeed);

    const firstJobId = await ctx.scheduler.runAfter(Math.max(300, Math.floor(STEP_DELAY_MS[speed].dispatching / 2)), internal.rideAgent.runRideAgentStep, {
      rideId: args.rideId,
      runId,
      step: "dispatching",
    });

    await ctx.db.patch(args.rideId, {
      agentRunId: runId,
      agentStatus: "running",
      agentSpeed: speed,
      agentJobIds: [String(firstJobId)],
      lastStepAt: now,
      updatedAt: now,
    });

    await logRideAgentAction(ctx, {
      rideId: args.rideId,
      actionType: "start",
      input: { runId, speed },
      output: { scheduledStep: "dispatching" },
    });

    return { ok: true, runId, speed };
  },
});

export const stopRideAgent = mutation({
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    for (const jobId of ride.agentJobIds ?? []) {
      await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">).catch(() => null);
    }

    const now = Date.now();
    await ctx.db.patch(args.rideId, {
      agentStatus: "stopped",
      agentJobIds: [],
      updatedAt: now,
      lastStepAt: now,
    });

    await logRideAgentAction(ctx, {
      rideId: args.rideId,
      actionType: "stop",
      input: { previousRunId: ride.agentRunId ?? null },
      output: { cancelledJobs: ride.agentJobIds?.length ?? 0 },
    });

    return { ok: true };
  },
});

export const runRideAgentStep = internalMutation({
  args: {
    rideId: v.id("rides"),
    runId: v.string(),
    step: v.union(
      v.literal("dispatching"),
      v.literal("assigned"),
      v.literal("awaiting_driver_response"),
      v.literal("driver_arriving"),
      v.literal("picked_up"),
      v.literal("completed"),
    ),
  },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) return;

    if (ride.agentStatus !== "running" || ride.agentRunId !== args.runId) {
      return;
    }

    const speed = resolveSpeed(ride.agentSpeed);

    // Payment is collected after trip completion, so dispatch/assignment must not block on payment.

    if (args.step === "assigned" && !ride.assignedDriverId) {
      const candidates = await ctx.db
        .query("drivers")
        .withIndex("by_availability", (q) => q.eq("availability", "online"))
        .collect();

      const declinedSet = new Set((ride.declinedDriverIds ?? []).map(String));

      const best = candidates
        .filter(
          (d) =>
            d.vehicleType === ride.vehicleType &&
            isDriverSubscribed(d, Date.now()) &&
            !declinedSet.has(String(d._id)),
        )
        .map((d) => ({
          driverId: d._id,
          distanceKm: haversineKm(ride.pickup.lat, ride.pickup.lng, d.lastLocation.lat, d.lastLocation.lng),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

      if (!best) {
        const retryMs = WAIT_DRIVER_RETRY_MS[speed];
        const retryJobId = await ctx.scheduler.runAfter(retryMs, internal.rideAgent.runRideAgentStep, {
          rideId: args.rideId,
          runId: args.runId,
          step: "assigned",
        });

        await ctx.db.patch(args.rideId, {
          agentJobIds: [String(retryJobId)],
          updatedAt: Date.now(),
        });

        await logRideAgentAction(ctx, {
          rideId: args.rideId,
          actionType: "wait_driver",
          input: { step: args.step, speed, skippedDeclined: declinedSet.size },
          output: { reason: `No eligible online drivers found (${declinedSet.size} declined), retrying in ${retryMs}ms` },
        });

        return;
      }

      // Resolve driver name for logging
      const assignedDriverDoc = candidates.find((d) => String(d._id) === String(best.driverId));
      const assignedUser = assignedDriverDoc ? await ctx.db.get(assignedDriverDoc.userId) : null;
      const assignedDriverName = assignedUser?.name ?? "Unknown";

      const now = Date.now();
      const deadline = now + DRIVER_RESPONSE_TIMEOUT_MS;
      await ctx.db.patch(best.driverId, { availability: "busy", lastActiveAt: now });
      await ctx.db.patch(args.rideId, {
        assignedDriverId: best.driverId,
        driverResponseStatus: "pending",
        driverResponseDeadline: deadline,
        updatedAt: now,
      });

      await logRideAgentAction(ctx, {
        rideId: args.rideId,
        actionType: "assign_driver",
        input: { step: args.step, speed },
        output: {
          driverId: best.driverId,
          driverName: assignedDriverName,
          distanceKm: Number(best.distanceKm.toFixed(2)),
          summary: `${assignedDriverName} (${best.distanceKm.toFixed(1)} km away)`,
          notifyScheduled: true,
        },
      });

      // Fire webhook notification to assigned driver — driver decides accept/decline
      await ctx.scheduler.runAfter(0, internal.rideAgent.notifyDriverWebhookAction, {
        rideId: args.rideId,
        driverId: best.driverId,
        runId: args.runId,
      });
    }

    // Handle awaiting_driver_response step: poll for driver accept/decline
    if (args.step === "awaiting_driver_response") {
      const freshForResponse = await ctx.db.get(args.rideId);
      if (!freshForResponse) return;

      const responseStatus = freshForResponse.driverResponseStatus;
      const deadline = freshForResponse.driverResponseDeadline ?? 0;
      const now = Date.now();

      if (responseStatus === "accepted") {
        // Driver accepted — proceed to driver_arriving
        await logRideAgentAction(ctx, {
          rideId: args.rideId,
          actionType: "driver_accepted",
          input: { step: args.step },
          output: { status: "accepted", note: "Driver confirmed — proceeding to pickup" },
        });

        const nextJobId = await ctx.scheduler.runAfter(
          STEP_DELAY_MS[speed]["awaiting_driver_response"],
          internal.rideAgent.runRideAgentStep,
          { rideId: args.rideId, runId: args.runId, step: "driver_arriving" },
        );
        await ctx.db.patch(args.rideId, { agentJobIds: [String(nextJobId)], updatedAt: now });
        return;
      } else if (responseStatus === "declined") {
        // Driver declined — go back to find another driver
        await logRideAgentAction(ctx, {
          rideId: args.rideId,
          actionType: "retry_dispatch",
          input: { step: args.step },
          output: { status: "declined", note: "Driver declined — re-assigning to next eligible driver" },
        });

        const retryJobId = await ctx.scheduler.runAfter(
          WAIT_DRIVER_RETRY_MS[speed],
          internal.rideAgent.runRideAgentStep,
          { rideId: args.rideId, runId: args.runId, step: "assigned" },
        );

        await ctx.db.patch(args.rideId, {
          agentJobIds: [String(retryJobId)],
          updatedAt: now,
        });

        return;
      } else if (now >= deadline) {
        // Timeout — driver didn't respond, try next driver
        await ctx.db.patch(args.rideId, {
          driverResponseStatus: "timeout",
          updatedAt: now,
        });

        await logRideAgentAction(ctx, {
          rideId: args.rideId,
          actionType: "driver_response_timeout",
          input: { step: args.step, deadlineMs: deadline },
          output: { status: "timeout", note: "No response within deadline — reassigning to next driver" },
        });

        // Go back to assigned step to find next driver
        const retryJobId = await ctx.scheduler.runAfter(
          STEP_DELAY_MS[speed]["awaiting_driver_response"],
          internal.rideAgent.runRideAgentStep,
          { rideId: args.rideId, runId: args.runId, step: "assigned" },
        );
        await ctx.db.patch(args.rideId, { agentJobIds: [String(retryJobId)], updatedAt: now });
        return;
      } else {
        // Still waiting — poll again in 3s
        await logRideAgentAction(ctx, {
          rideId: args.rideId,
          actionType: "wait_driver_response",
          input: { step: args.step, remainingMs: deadline - now },
          output: { status: "pending", note: "Waiting for driver to accept or decline" },
        });

        const pollJobId = await ctx.scheduler.runAfter(3000, internal.rideAgent.runRideAgentStep, {
          rideId: args.rideId,
          runId: args.runId,
          step: "awaiting_driver_response",
        });

        await ctx.db.patch(args.rideId, {
          agentJobIds: [String(pollJobId)],
          updatedAt: now,
        });

        return;
      }
    }

    const freshRide = await ctx.db.get(args.rideId);
    if (!freshRide || freshRide.agentStatus !== "running" || freshRide.agentRunId !== args.runId) return;

    const noteByStep: Record<string, string> = {
      dispatching: "Ride agent moved ride to dispatching",
      assigned: "Ride agent ensured driver assignment",
      awaiting_driver_response: "Ride agent waiting for driver response",
      driver_arriving: "Ride agent marked driver arriving",
      picked_up: "Ride agent marked passenger picked up",
      completed: "Ride agent completed trip",
    };

    if (args.step === "dispatching" && freshRide.status !== "dispatching") {
      await updateRideStatus(ctx, freshRide, "dispatching", noteByStep.dispatching);
    } else if (args.step !== "dispatching") {
      await updateRideStatus(ctx, freshRide, args.step, noteByStep[args.step]);
    } else {
      await ctx.db.patch(args.rideId, { lastStepAt: Date.now(), updatedAt: Date.now() });
    }

    await logRideAgentAction(ctx, {
      rideId: args.rideId,
      actionType: "step",
      input: { step: args.step, speed },
      output: { status: args.step === "dispatching" ? "dispatching_checked" : args.step },
    });

    // After driver accepts, STOP agent — driver controls the rest via API
    // (arrive, complete endpoints handle state transitions)
    if (args.step === "driver_arriving") {
      await ctx.db.patch(args.rideId, {
        agentStatus: "waiting_driver",
        agentJobIds: [],
        lastStepAt: Date.now(),
        updatedAt: Date.now(),
      });

      await logRideAgentAction(ctx, {
        rideId: args.rideId,
        actionType: "agent_pause",
        input: { step: args.step, speed },
        output: { reason: "Driver accepted — agent paused. Driver controls ride via API (arrive/complete)." },
      });
      return;
    }

    const upcomingStep = nextStep[args.step];
    if (!upcomingStep) {
      const doneRide = await ctx.db.get(args.rideId);
      if (doneRide?.assignedDriverId) {
        await ctx.db.patch(doneRide.assignedDriverId, { availability: "online", lastActiveAt: Date.now() });
      }

      await ctx.db.patch(args.rideId, {
        agentStatus: "completed",
        agentJobIds: [],
        lastStepAt: Date.now(),
        updatedAt: Date.now(),
      });

      await logRideAgentAction(ctx, {
        rideId: args.rideId,
        actionType: "finish",
        input: { runId: args.runId, speed },
        output: { finalStatus: "completed" },
      });
      return;
    }

    const nextJobId = await ctx.scheduler.runAfter(STEP_DELAY_MS[speed][args.step], internal.rideAgent.runRideAgentStep, {
      rideId: args.rideId,
      runId: args.runId,
      step: upcomingStep,
    });

    await ctx.db.patch(args.rideId, {
      agentJobIds: [String(nextJobId)],
      updatedAt: Date.now(),
    });
  },
});

// ─── Driver Notification Webhook Action ─────────────────────────────────────
// Runs as a Convex action (can do HTTP fetch) to POST ride details to webhook

export const notifyDriverWebhookAction = internalAction({
  args: {
    rideId: v.id("rides"),
    driverId: v.id("drivers"),
    runId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check per-driver webhook first, fallback to global env var
    const driverRecord = await ctx.runQuery(api.drivers.getDriver, { driverId: args.driverId });
    const driverWebhook = driverRecord?.notificationWebhook;
    const globalWebhook = process.env.DRIVER_NOTIFICATION_WEBHOOK;
    const webhookUrl = driverWebhook || globalWebhook;

    if (!webhookUrl) {
      console.warn("[notifyDriver] No webhook configured (neither per-driver nor global), skipping notification");
      return;
    }

    console.log(`[notifyDriver] Using ${driverWebhook ? "per-driver" : "global"} webhook: ${webhookUrl}`);

    const ride = await ctx.runQuery(api.rides.getRide, { rideId: args.rideId });
    if (!ride) {
      console.warn("[notifyDriver] Ride not found", args.rideId);
      return;
    }

    const { ride: rideData, driver } = ride;
    if (!driver) {
      console.warn("[notifyDriver] No driver on ride", args.rideId);
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://gojek-mvp.vercel.app";

    const payload = {
      driverName: driver.userName ?? "Driver",
      driverPhone: (driver as any).userPhone ?? driver.notificationWebhook ?? "unknown",
      rideCode: rideData.code,
      pickup: rideData.pickup.address,
      dropoff: rideData.dropoff.address,
      estimatedFare: rideData.price.amount,
      vehicleType: rideData.vehicleType,
      action: "ride_assigned",
      acceptUrl: `${baseUrl}/api/ops/rides/${args.rideId}/driver-response?action=accept`,
      declineUrl: `${baseUrl}/api/ops/rides/${args.rideId}/driver-response?action=decline`,
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log(`[notifyDriver] Webhook ${webhookUrl} responded ${res.status} for ride ${rideData.code}`);
    } catch (err) {
      console.error("[notifyDriver] Webhook call failed", err);
    }
  },
});
