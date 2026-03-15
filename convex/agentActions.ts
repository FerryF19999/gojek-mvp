import { query } from "./_generated/server";
import { v } from "convex/values";

const ORDERED_AGENTS = [
  "dispatch_agent",
  "ride_agent",
  "support_agent",
  "payment_agent",
] as const;

type AgentName = (typeof ORDERED_AGENTS)[number];

const isFailure = (actionType: string, output: string) => {
  const action = actionType.toLowerCase();
  const out = output.toLowerCase();
  return (
    action.includes("fail") ||
    action.includes("error") ||
    out.includes("\"error\"") ||
    out.includes("error") ||
    out.includes("failed")
  );
};

const isDone = (actionType: string, output: string) => {
  const action = actionType.toLowerCase();
  const out = output.toLowerCase();
  return (
    ["done", "finish", "completed", "settlement", "mark_paid_demo"].some((token) => action.includes(token)) ||
    out.includes("\"status\":\"paid\"") ||
    out.includes("\"status\":\"completed\"")
  );
};

const isRunningAction = (actionType: string) => {
  const action = actionType.toLowerCase();
  return ["start", "step", "assign", "wait", "processing", "running"].some((token) => action.includes(token));
};

const inferStatus = (actions: any[]) => {
  if (!actions.length) return "IDLE" as const;
  const [latest] = actions;

  if (isFailure(latest.actionType, latest.output)) return "FAILED" as const;
  if (isDone(latest.actionType, latest.output)) return "DONE" as const;

  const hasStart = actions.some((a) => a.actionType.toLowerCase().includes("start"));
  const hasDone = actions.some((a) => isDone(a.actionType, a.output));
  const recentMs = Date.now() - latest.createdAt;
  const recentlyActive = recentMs <= 5 * 60 * 1000;

  if ((hasStart && !hasDone) || (isRunningAction(latest.actionType) && recentlyActive)) return "RUNNING" as const;

  return "DONE" as const;
};

export const listAgentActions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agent_actions").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const getRideAgentCards = query({
  args: {
    rideId: v.id("rides"),
    limitPerAgent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("agent_actions")
      .withIndex("by_rideId", (q) => q.eq("rideId", args.rideId))
      .collect();

    const byAgent = new Map<AgentName, any[]>();
    for (const agent of ORDERED_AGENTS) byAgent.set(agent, []);

    for (const row of rows) {
      const agentName = row.agentName as AgentName;
      if (!byAgent.has(agentName)) continue;
      byAgent.get(agentName)!.push(row);
    }

    const limit = Math.min(Math.max(args.limitPerAgent ?? 10, 1), 20);

    return ORDERED_AGENTS.map((agentName) => {
      const sorted = (byAgent.get(agentName) ?? []).sort((a, b) => b.createdAt - a.createdAt);
      const latest = sorted[0] ?? null;
      return {
        agentName,
        status: inferStatus(sorted),
        lastActionType: latest?.actionType ?? null,
        lastUpdatedAt: latest?.createdAt ?? null,
        lastOutput: latest?.output ?? null,
        totalActions: sorted.length,
        actions: sorted.slice(0, limit),
      };
    });
  },
});
