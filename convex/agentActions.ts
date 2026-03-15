import { query } from "./_generated/server";

export const listAgentActions = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("agent_actions").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});
