import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    role: v.union(v.literal("admin"), v.literal("operator"), v.literal("driver")),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("suspended")),
    createdAt: v.number(),
  }).index("by_role", ["role"]),

  drivers: defineTable({
    userId: v.id("users"),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    availability: v.union(v.literal("online"), v.literal("offline"), v.literal("busy")),
    rating: v.optional(v.number()),
    lastLocation: v.object({
      lat: v.number(),
      lng: v.number(),
      updatedAt: v.number(),
    }),
    lastActiveAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_availability", ["availability"]),

  rides: defineTable({
    code: v.string(),
    customerName: v.string(),
    customerPhone: v.string(),
    agentRunId: v.optional(v.string()),
    agentStatus: v.union(v.literal("running"), v.literal("stopped"), v.literal("completed")),
    agentSpeed: v.optional(v.union(v.literal("slow"), v.literal("normal"), v.literal("fast"))),
    agentJobIds: v.array(v.string()),
    lastStepAt: v.optional(v.number()),
    pickup: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
      note: v.optional(v.string()),
    }),
    dropoff: v.object({
      address: v.string(),
      lat: v.number(),
      lng: v.number(),
      note: v.optional(v.string()),
    }),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    price: v.object({
      amount: v.number(),
      currency: v.literal("IDR"),
    }),
    status: v.union(
      v.literal("created"),
      v.literal("dispatching"),
      v.literal("assigned"),
      v.literal("driver_arriving"),
      v.literal("picked_up"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    assignedDriverId: v.optional(v.id("drivers")),
    timeline: v.array(
      v.object({
        type: v.string(),
        at: v.number(),
        by: v.string(),
        note: v.optional(v.string()),
      }),
    ),
    paymentStatus: v.union(
      v.literal("unpaid"),
      v.literal("pending"),
      v.literal("paid"),
      v.literal("failed"),
      v.literal("refunded"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_assignedDriverId", ["assignedDriverId"]),

  payments: defineTable({
    rideId: v.id("rides"),
    provider: v.union(v.literal("midtrans"), v.literal("xendit")),
    providerRef: v.string(),
    qrisUrl: v.optional(v.string()),
    qrString: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("expired"), v.literal("refunded")),
    amount: v.number(),
    rawWebhookPayload: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_rideId", ["rideId"])
    .index("by_providerRef", ["providerRef"]),

  agent_actions: defineTable({
    rideId: v.optional(v.id("rides")),
    agentName: v.union(v.literal("dispatch_agent"), v.literal("support_agent"), v.literal("pricing_agent"), v.literal("ride_agent")),
    actionType: v.string(),
    input: v.string(),
    output: v.string(),
    approvedBy: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_rideId", ["rideId"]),

  webhook_events: defineTable({
    provider: v.string(),
    eventId: v.string(),
    createdAt: v.number(),
  }).index("by_provider_event", ["provider", "eventId"]),
});
