import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const STEP_DELAY_MS = {
  dispatching: 2500,
  assigned: 3500,
  driver_arriving: 4500,
  picked_up: 4500,
  completed: 1000,
} as const;

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
  args: { rideId: v.id("rides") },
  handler: async (ctx, args) => {
    const ride = await ctx.db.get(args.rideId);
    if (!ride) throw new Error("Ride not found");

    if (ride.agentStatus === "running" && ride.agentRunId) {
      return { ok: true, alreadyRunning: true, runId: ride.agentRunId };
    }

    for (const jobId of ride.agentJobIds ?? []) {
      await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">).catch(() => null);
    }

    const now = Date.now();
    const runId = `${String(args.rideId)}-${now}`;

    const firstJobId = await ctx.scheduler.runAfter(1000, internal.rideAgent.runRideAgentStep, {
      rideId: args.rideId,
      runId,
      step: "dispatching",
    });

    await ctx.db.patch(args.rideId, {
      agentRunId: runId,
      agentStatus: "running",
      agentJobIds: [String(firstJobId)],
      lastStepAt: now,
      updatedAt: now,
    });

    await logRideAgentAction(ctx, {
      rideId: args.rideId,
      actionType: "start",
      input: { runId },
      output: { scheduledStep: "dispatching" },
    });

    return { ok: true, runId };
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

    if (args.step === "assigned" && !ride.assignedDriverId) {
      const candidates = await ctx.db
        .query("drivers")
        .withIndex("by_availability", (q) => q.eq("availability", "online"))
        .collect();

      const best = candidates
        .filter((d) => d.vehicleType === ride.vehicleType)
        .map((d) => ({
          driverId: d._id,
          distanceKm: haversineKm(ride.pickup.lat, ride.pickup.lng, d.lastLocation.lat, d.lastLocation.lng),
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

      if (!best) {
        const retryJobId = await ctx.scheduler.runAfter(4000, internal.rideAgent.runRideAgentStep, {
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
          input: { step: args.step },
          output: { reason: "No online drivers found, retrying in 4s" },
        });

        return;
      }

      const now = Date.now();
      await ctx.db.patch(best.driverId, { availability: "busy", lastActiveAt: now });
      await ctx.db.patch(args.rideId, { assignedDriverId: best.driverId, updatedAt: now });

      await logRideAgentAction(ctx, {
        rideId: args.rideId,
        actionType: "assign_driver",
        input: { step: args.step },
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
      input: { step: args.step },
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
        input: { runId: args.runId },
        output: { finalStatus: "completed" },
      });
      return;
    }

    const nextJobId = await ctx.scheduler.runAfter(STEP_DELAY_MS[args.step], internal.rideAgent.runRideAgentStep, {
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
