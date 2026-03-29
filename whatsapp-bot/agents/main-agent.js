/**
 * Main AI Agent — Orchestrator
 * Uses real LLM (Claude/GPT) for complex dispatch decisions
 * Falls back to rule-based when LLM unavailable
 */

const { agentLoop, isAvailable, LLM_PROVIDER, LLM_MODEL } = require("./llm-provider");
const { toolDefinitions, executeTool, setConvexClient, setCentralSocket } = require("./tools");
const adminNotify = require("./admin-notify");
const { ConvexHttpClient } = require("convex/browser");

let convexClient = null;
let running = false;
let consecutiveErrors = 0;
let usingFallback = false;
let lastHealthCheck = 0;

const DISPATCH_INTERVAL_MS = 5000;
const HEALTH_CHECK_INTERVAL_MS = 30000;
const DRIVER_TIMEOUT_MS = 30000;
const MAX_CONSECUTIVE_ERRORS = 3;

const SYSTEM_PROMPT = `Kamu adalah dispatch agent Nemu Ojek, platform ojek online di Indonesia.

TUGASMU:
1. Assign driver terbaik untuk setiap ride baru
2. Pertimbangkan: jarak (prioritas utama), rating, dan workload
3. Kalau driver nggak respon dalam 30 detik, reassign ke driver lain
4. Monitor ride yang stuck lebih dari 5 menit — cancel atau reassign
5. Log semua keputusan dengan reasoning yang jelas

ATURAN:
- Selalu pilih driver terdekat yang online dan punya subscription aktif
- Kalau nggak ada driver dalam radius 5km, log dan notify admin
- Kalau ride stuck, coba reassign dulu sebelum cancel
- Jangan assign driver yang sudah on_ride

Gunakan tools yang tersedia untuk mengambil tindakan. Setiap keputusan harus punya reasoning.`;

// ─── Initialize ───

function init(client) {
  convexClient = client;
  setConvexClient(client);
}

function setCentral(sock) {
  setCentralSocket(sock);
  adminNotify.setCentralSocket(sock);
}

// ─── Rule-based Fallback (no LLM needed) ───

async function fallbackDispatch() {
  if (!convexClient) return;

  try {
    const rides = await convexClient.query("rides:listRides");

    // Find rides that need dispatching
    const pending = rides.filter((r) =>
      ["created", "dispatching"].includes(r.status) && !r.assignedDriverId
    );

    for (const ride of pending) {
      // Get nearest drivers
      const suggestions = await convexClient.query("dispatch:dispatchSuggestions", {
        rideId: ride._id,
      });

      const driverList = suggestions.suggestions || suggestions.drivers || [];
      if (driverList.length > 0) {
        const best = driverList[0];
        try {
          await convexClient.mutation("rides:assignDriver", {
            rideId: ride._id,
            driverId: best.driverId,
            assignedBy: "bot-dispatch",
          });
          console.log(`[main-agent] Fallback assigned ${best.driverId} to ${ride.code}`);
        } catch (e) {
          console.warn(`[main-agent] Fallback assign failed for ${ride.code}:`, e.message);
        }
      }
    }

    // Check for driver timeouts
    const awaitingResponse = rides.filter((r) =>
      r.status === "awaiting_driver_response" &&
      r.driverResponseDeadline &&
      Date.now() > r.driverResponseDeadline
    );

    for (const ride of awaitingResponse) {
      console.log(`[main-agent] Driver timeout for ${ride.code}, reassigning...`);
      try {
        await executeTool("reassign_ride", {
          ride_code: ride.code,
          reason: "Driver response timeout (fallback)",
        });
      } catch (e) {
        console.warn(`[main-agent] Fallback reassign failed:`, e.message);
      }
    }
  } catch (e) {
    console.warn("[main-agent] Fallback dispatch error:", e.message);
  }
}

// ─── AI-Powered Dispatch ───

async function aiDispatch() {
  if (!convexClient) return;

  const rides = await convexClient.query("rides:listRides");
  const pending = rides.filter((r) =>
    ["created", "dispatching"].includes(r.status) && !r.assignedDriverId
  );
  const timedOut = rides.filter((r) =>
    r.status === "awaiting_driver_response" &&
    r.driverResponseDeadline &&
    Date.now() > r.driverResponseDeadline
  );

  if (pending.length === 0 && timedOut.length === 0) return;

  // Build context for the AI
  let context = "Situasi saat ini:\n";
  if (pending.length > 0) {
    context += `\n${pending.length} ride perlu driver:\n`;
    for (const r of pending) {
      context += `- ${r.code}: ${r.pickup.address} → ${r.dropoff.address} (Rp ${r.price.amount})\n`;
    }
  }
  if (timedOut.length > 0) {
    context += `\n${timedOut.length} ride timeout (driver nggak respon):\n`;
    for (const r of timedOut) {
      context += `- ${r.code}: perlu reassign\n`;
    }
  }
  context += "\nAmbil tindakan yang diperlukan menggunakan tools.";

  try {
    const result = await agentLoop(
      SYSTEM_PROMPT,
      context,
      toolDefinitions,
      executeTool,
      8 // max iterations
    );

    if (result.text) {
      console.log(`[main-agent] AI: ${result.text.slice(0, 200)}`);
    }

    // Reset error counter on success
    if (consecutiveErrors > 0) {
      consecutiveErrors = 0;
      if (usingFallback) {
        usingFallback = false;
        await adminNotify.recovery(
          "AI Agent kembali normal. Switching dari rule-based ke AI dispatch.",
          "llm_recovery"
        );
      }
    }
  } catch (e) {
    consecutiveErrors++;
    console.error(`[main-agent] AI dispatch error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, e.message);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !usingFallback) {
      usingFallback = true;
      const errorMsg = e.message.includes("timeout") || e.message.includes("abort")
        ? `AI Agent timeout ${consecutiveErrors}x berturut-turut. Switching ke rule-based dispatch.`
        : e.message.includes("rate") || e.message.includes("429")
        ? `AI Agent rate limited. Switching ke rule-based untuk sementara.`
        : `AI Agent error: ${e.message.slice(0, 100)}. Switching ke rule-based.`;

      await adminNotify.warn(errorMsg, "llm_fallback");
    }

    // Fallback to rule-based
    await fallbackDispatch();
  }
}

// ─── Health Check ───

async function healthCheck() {
  if (!convexClient) return;

  try {
    const rides = await convexClient.query("rides:listRides");
    const stuck = rides.filter((r) => {
      if (!["dispatching", "assigned", "awaiting_driver_response"].includes(r.status)) return false;
      return Date.now() - r.updatedAt > 5 * 60 * 1000; // 5 minutes
    });

    if (stuck.length > 0) {
      console.log(`[main-agent] Found ${stuck.length} stuck rides`);

      if (isAvailable() && !usingFallback) {
        // Let AI handle stuck rides
        const context = `Health check: ${stuck.length} ride stuck:\n` +
          stuck.map((r) => `- ${r.code}: status=${r.status}, stuck ${Math.round((Date.now() - r.updatedAt) / 60000)} menit`).join("\n") +
          "\n\nResolve setiap stuck ride: reassign kalau masih ada driver, cancel kalau tidak.";

        try {
          await agentLoop(SYSTEM_PROMPT, context, toolDefinitions, executeTool, 5);
        } catch {
          // Fallback
          for (const r of stuck) {
            try {
              await executeTool("resolve_stuck_ride", {
                ride_code: r.code,
                action: "cancel",
                reason: "Stuck > 5 minutes, no AI available",
              });
            } catch {}
          }
        }
      } else {
        // Fallback: cancel stuck rides
        for (const r of stuck) {
          try {
            await executeTool("resolve_stuck_ride", {
              ride_code: r.code,
              action: "cancel",
              reason: "Stuck > 5 minutes (rule-based fallback)",
            });
            await adminNotify.warn(
              `Ride ${r.code} auto-cancelled: stuck ${Math.round((Date.now() - r.updatedAt) / 60000)} menit tanpa progress.`,
              `stuck_${r.code}`
            );
          } catch {}
        }
      }
    }
  } catch (e) {
    console.warn("[main-agent] Health check error:", e.message);
  }
}

// ─── Main Loop ───

async function tick() {
  if (!convexClient) return;

  try {
    // Dispatch
    if (isAvailable() && !usingFallback) {
      await aiDispatch();
    } else {
      await fallbackDispatch();
    }

    // Health check every 30s
    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
      lastHealthCheck = Date.now();
      await healthCheck();
    }
  } catch (e) {
    console.error("[main-agent] Tick error:", e.message);
    await adminNotify.error(
      `AI Agent crash: ${e.message.slice(0, 200)}. Auto-restart dalam 5 detik.`,
      "agent_crash"
    );
  }
}

function start() {
  if (running) return;
  running = true;

  console.log(`[main-agent] Starting... LLM: ${isAvailable() ? `${LLM_PROVIDER}/${LLM_MODEL}` : "DISABLED (rule-based)"}`);

  if (!isAvailable()) {
    console.log("[main-agent] No API key configured. Running in rule-based mode.");
    adminNotify.warn(
      "AI Agent tidak aktif — API key tidak ditemukan.\nBot jalan mode rule-based dispatch.",
      "no_api_key"
    );
  }

  setInterval(() => tick().catch((e) => console.error("[main-agent]", e.message)), DISPATCH_INTERVAL_MS);
}

function stop() {
  running = false;
}

module.exports = { init, setCentral, start, stop };
