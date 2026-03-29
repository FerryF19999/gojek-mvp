/**
 * Tools for the Main AI Agent (Orchestrator)
 * These are callable via LLM tool use
 */

const { ConvexHttpClient } = require("convex/browser");
const { getDriverSocket } = require("../driver-sessions");
const { notifyDriverNewRide, markDriverRideCompleted, getDriverState } = require("../driver-handler");
const { sendReply, normalizePhone } = require("../utils");
const { getDriverRides } = require("../api-client");
const adminNotify = require("./admin-notify");

let convexClient = null;

function setConvexClient(client) {
  convexClient = client;
}

// ─── Tool Definitions (for LLM) ───

const toolDefinitions = [
  {
    name: "find_nearest_drivers",
    description: "Find online drivers nearest to a pickup location, sorted by score (distance + rating). Returns top 5.",
    parameters: {
      type: "object",
      properties: {
        pickup_lat: { type: "number", description: "Pickup latitude" },
        pickup_lng: { type: "number", description: "Pickup longitude" },
        vehicle_type: { type: "string", enum: ["motor", "car"], description: "Required vehicle type" },
      },
      required: ["pickup_lat", "pickup_lng", "vehicle_type"],
    },
  },
  {
    name: "assign_driver",
    description: "Assign a driver to a ride. Updates ride status and notifies the driver via their WhatsApp bot.",
    parameters: {
      type: "object",
      properties: {
        ride_id: { type: "string", description: "Convex ride document ID" },
        driver_id: { type: "string", description: "Convex driver document ID" },
        reason: { type: "string", description: "Why this driver was chosen (logged for audit)" },
      },
      required: ["ride_id", "driver_id", "reason"],
    },
  },
  {
    name: "reassign_ride",
    description: "Reassign a ride to a different driver (e.g., after timeout or decline). Finds next best driver.",
    parameters: {
      type: "object",
      properties: {
        ride_code: { type: "string", description: "Ride code (e.g., RIDE-000042)" },
        reason: { type: "string", description: "Why reassignment is needed" },
      },
      required: ["ride_code", "reason"],
    },
  },
  {
    name: "notify_passenger",
    description: "Send a WhatsApp message to a passenger via the central bot.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "Passenger phone number" },
        message: { type: "string", description: "Message text to send" },
      },
      required: ["phone", "message"],
    },
  },
  {
    name: "get_platform_health",
    description: "Get current platform health: online drivers, active rides, pending rides.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_stuck_rides",
    description: "Find rides that have been in dispatching/assigned status for too long without progress.",
    parameters: {
      type: "object",
      properties: {
        threshold_minutes: { type: "number", description: "Minutes threshold (default: 5)" },
      },
    },
  },
  {
    name: "resolve_stuck_ride",
    description: "Take action on a stuck ride: cancel it or try reassigning.",
    parameters: {
      type: "object",
      properties: {
        ride_code: { type: "string" },
        action: { type: "string", enum: ["cancel", "reassign"], description: "What to do with the stuck ride" },
        reason: { type: "string" },
      },
      required: ["ride_code", "action", "reason"],
    },
  },
  {
    name: "log_decision",
    description: "Log an agent decision with reasoning to the audit trail.",
    parameters: {
      type: "object",
      properties: {
        ride_id: { type: "string", description: "Optional ride ID" },
        agent_name: { type: "string", description: "Which agent made the decision" },
        decision: { type: "string", description: "What was decided" },
        reasoning: { type: "string", description: "Why this decision was made" },
      },
      required: ["agent_name", "decision", "reasoning"],
    },
  },
  {
    name: "notify_admin_alert",
    description: "Send an alert to the admin operator about an issue that needs attention.",
    parameters: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["warning", "error"], description: "Alert severity" },
        message: { type: "string", description: "Alert message" },
      },
      required: ["severity", "message"],
    },
  },
];

// ─── Tool Executor ───

let centralSocket = null;

function setCentralSocket(sock) {
  centralSocket = sock;
}

async function executeTool(name, args) {
  if (!convexClient) throw new Error("Convex client not initialized");

  switch (name) {
    case "find_nearest_drivers": {
      const result = await convexClient.query("dispatch:dispatchSuggestions", {
        rideId: undefined,
        pickupLat: args.pickup_lat,
        pickupLng: args.pickup_lng,
        vehicleType: args.vehicle_type,
      });
      return JSON.stringify(result);
    }

    case "assign_driver": {
      await convexClient.mutation("rides:assignDriver", {
        rideId: args.ride_id,
        driverId: args.driver_id,
      });
      // Log the decision
      await convexClient.mutation("agentActions:log", {
        rideId: args.ride_id,
        agentName: "dispatch_agent",
        actionType: "assign_driver",
        input: JSON.stringify({ driverId: args.driver_id }),
        output: JSON.stringify({ reason: args.reason }),
        approvedBy: "ai-main-agent",
      });
      // Notify driver via their personal bot
      const driverInfo = getDriverSocket(args.driver_id);
      if (driverInfo) {
        const rides = await convexClient.query("rides:listRides");
        const ride = rides.find((r) => r.assignedDriverId === args.driver_id);
        if (ride) {
          const jid = `${driverInfo.phone}@s.whatsapp.net`;
          await notifyDriverNewRide(driverInfo.sock, jid, args.driver_id, ride);
        }
      }
      return JSON.stringify({ success: true, reason: args.reason });
    }

    case "reassign_ride": {
      // Find the ride and get next driver
      const rides = await convexClient.query("rides:listRides");
      const ride = rides.find((r) => r.code === args.ride_code);
      if (!ride) return JSON.stringify({ error: "Ride not found" });

      // Find nearest available driver (excluding declined ones)
      const suggestions = await convexClient.query("dispatch:dispatchSuggestions", {
        rideId: ride._id,
        pickupLat: ride.pickup.lat,
        pickupLng: ride.pickup.lng,
        vehicleType: ride.vehicleType,
      });

      if (!suggestions.drivers?.length) {
        return JSON.stringify({ error: "No available drivers", reason: args.reason });
      }

      const nextDriver = suggestions.drivers[0];
      await convexClient.mutation("rides:assignDriver", {
        rideId: ride._id,
        driverId: nextDriver.driverId,
      });

      return JSON.stringify({ success: true, newDriverId: nextDriver.driverId, reason: args.reason });
    }

    case "notify_passenger": {
      if (!centralSocket) return JSON.stringify({ error: "Central bot not connected" });
      const phone = normalizePhone(args.phone);
      const jid = `${phone}@s.whatsapp.net`;
      await sendReply(centralSocket, jid, args.message);
      return JSON.stringify({ success: true });
    }

    case "get_platform_health": {
      const rides = await convexClient.query("rides:listRides");
      const activeRides = rides.filter((r) => !["completed", "cancelled", "expired"].includes(r.status));
      const pendingRides = rides.filter((r) => ["created", "dispatching"].includes(r.status));

      const drivers = await convexClient.query("drivers:listDrivers");
      const onlineDrivers = drivers.filter((d) => d.availability === "online");

      return JSON.stringify({
        online_drivers: onlineDrivers.length,
        active_rides: activeRides.length,
        pending_rides: pendingRides.length,
        total_drivers: drivers.length,
      });
    }

    case "get_stuck_rides": {
      const threshold = (args.threshold_minutes || 5) * 60 * 1000;
      const rides = await convexClient.query("rides:listRides");
      const stuck = rides.filter((r) => {
        if (!["dispatching", "assigned", "awaiting_driver_response"].includes(r.status)) return false;
        return Date.now() - r.updatedAt > threshold;
      });
      return JSON.stringify(stuck.map((r) => ({
        code: r.code,
        status: r.status,
        stuck_minutes: Math.round((Date.now() - r.updatedAt) / 60000),
        pickup: r.pickup?.address,
        dropoff: r.dropoff?.address,
      })));
    }

    case "resolve_stuck_ride": {
      const rides = await convexClient.query("rides:listRides");
      const ride = rides.find((r) => r.code === args.ride_code);
      if (!ride) return JSON.stringify({ error: "Ride not found" });

      if (args.action === "cancel") {
        await convexClient.mutation("rides:updateRideStatus", {
          rideId: ride._id,
          status: "cancelled",
          note: `Auto-cancelled by AI agent: ${args.reason}`,
          by: "ai-main-agent",
        });
        return JSON.stringify({ success: true, action: "cancelled" });
      }

      if (args.action === "reassign") {
        return await executeTool("reassign_ride", { ride_code: args.ride_code, reason: args.reason });
      }

      return JSON.stringify({ error: "Unknown action" });
    }

    case "log_decision": {
      await convexClient.mutation("agentActions:log", {
        rideId: args.ride_id || undefined,
        agentName: args.agent_name || "dispatch_agent",
        actionType: "ai_decision",
        input: JSON.stringify({ decision: args.decision }),
        output: JSON.stringify({ reasoning: args.reasoning }),
        approvedBy: "ai-main-agent",
      });
      return JSON.stringify({ logged: true });
    }

    case "notify_admin_alert": {
      await adminNotify.notifyAdmin(args.severity, args.message, `agent_${args.severity}`);
      return JSON.stringify({ sent: true });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

module.exports = {
  setConvexClient,
  setCentralSocket,
  toolDefinitions,
  executeTool,
};
