import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isDriverSubscribed } from "./subscription";

type AgentSpeed = "slow" | "normal" | "fast";

const STEP_DELAY_MS: Record<AgentSpeed, Record<"dispatching" | "assigned" | "driver_arriving" | "picked_up" | "completed", number>> = {
  slow: {
    dispatching: 6000,
    assigned: 8000,
    driver_arriving: 10000,
    picked_up: 10000,
    completed: 2000,
  },
  normal: {
    dispatching: 2500,
    assigned: 3500,
    driver_arriving: 4500,
    picked_up: 4500,
    completed: 1000,
  },
  fast: {
    dispatching: 1000,
    assigned: 1500,
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

const nextStep = {
  dispatching: "assigned",
  assigned: "driver_arriving",
  driver_arriving: "picked_up",
  picked_up: "completed",
  completed: null,
} as const;

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

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

async function updateRideStatus(ctx: any, ride: any, status: any, note: string) {
  const now = Date.now();
  if (ride.status === status) {
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

    if (args.step === "assigned" && !ride.assignedDriverId) {
      const candidates = await ctx.db
        .query("drivers")
        .withIndex("by_availability", (q) => q.eq("availability", "online"))
        .collect();

      const best = candidates
        .filter((d) => d.vehicleType === ride.vehicleType && isDriverSubscribed(d, Date.now()))
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
          input: { step: args.step, speed },
          output: { reason: `No subscribed online drivers found, retrying in ${retryMs}ms` },
        });

        return;
      }

      const now = Date.now();
      await ctx.db.patch(best.driverId, { availability: "busy", lastActiveAt: now });
      await ctx.db.patch(args.rideId, { assignedDriverId: best.driverId, updatedAt: now });

      await logRideAgentAction(ctx, {
        rideId: args.rideId,
        actionType: "assign_driver",
        input: { step: args.step, speed },
        output: { driverId: best.driverId, distanceKm: Number(best.distanceKm.toFixed(2)) },
      });
    }

    const freshRide = await ctx.db.get(args.rideId);
    if (!freshRide || freshRide.agentStatus !== "running" || freshRide.agentRunId !== args.runId) return;

    const noteByStep: Record<string, string> = {
      dispatching: "Ride agent moved ride to dispatching",
      assigned: "Ride agent ensured driver assignment",
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
