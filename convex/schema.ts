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
  })
    .index("by_role", ["role"])
    .index("by_phone", ["phone"]),

  drivers: defineTable({
    userId: v.id("users"),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    availability: v.union(v.literal("online"), v.literal("offline"), v.literal("busy")),
    subscriptionStatus: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    subscribedUntil: v.optional(v.number()),
    subscriptionPlan: v.optional(v.string()),
    rating: v.optional(v.number()),
    lastLocation: v.object({
      lat: v.number(),
      lng: v.number(),
      updatedAt: v.number(),
    }),
    notificationWebhook: v.optional(v.string()),
    apiToken: v.optional(v.string()),
    lastActiveAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_availability", ["availability"])
    .index("by_apiToken", ["apiToken"]),

  driverApplications: defineTable({
    fullName: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    city: v.string(),
    vehicleType: v.union(v.literal("motor"), v.literal("car")),
    vehicleBrand: v.string(),
    vehicleModel: v.string(),
    vehiclePlate: v.string(),
    licenseNumber: v.string(),
    emergencyContactName: v.string(),
    emergencyContactPhone: v.string(),
    referralCode: v.optional(v.string()),
    otpCode: v.string(),
    otpSentAt: v.number(),
    otpVerifiedAt: v.optional(v.number()),
    status: v.union(v.literal("otp_pending"), v.literal("pending_payment"), v.literal("active")),
    userId: v.optional(v.id("users")),
    driverId: v.optional(v.id("drivers")),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_phone", ["phone"])
    .index("by_status", ["status"]),

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
      v.literal("awaiting_payment"),
      v.literal("dispatching"),
      v.literal("assigned"),
      v.literal("driver_arriving"),
      v.literal("picked_up"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
      v.literal("awaiting_driver_response"),
    ),
    assignedDriverId: v.optional(v.id("drivers")),
    declinedDriverIds: v.optional(v.array(v.id("drivers"))),
    driverResponseStatus: v.optional(v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined"), v.literal("timeout"))),
    driverResponseDeadline: v.optional(v.number()),
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
    agentName: v.union(
      v.literal("dispatch_agent"),
      v.literal("ride_agent"),
      v.literal("support_agent"),
      v.literal("payment_agent"),
      v.literal("pricing_agent"),
    ),
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

  geocodes: defineTable({
    query: v.string(),
    lat: v.number(),
    lng: v.number(),
    displayName: v.string(),
    provider: v.string(),
    createdAt: v.number(),
  }).index("by_query", ["query"]),

  waitlist: defineTable({
    name: v.string(),
    email: v.string(),
    company: v.optional(v.string()),
    role: v.optional(v.string()),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_createdAt", ["createdAt"]),
});
