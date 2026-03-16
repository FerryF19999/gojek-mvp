/**
 * State Machine — Driver state transitions for WhatsApp Bridge
 * 
 * States: unknown → registering → idle → online → offered → picking_up → at_pickup → on_ride → online
 */

export type DriverState =
  | "unknown"
  | "registering"
  | "idle"
  | "online"
  | "offered"
  | "picking_up"
  | "at_pickup"
  | "on_ride";

export type RegistrationStep =
  | "name"
  | "vehicle_type"
  | "vehicle_brand"
  | "plate"
  | "ktp"
  | "sim"
  | "payment_method"
  | "payment_number"
  | "confirm"
  | null;

export interface DriverWhatsappState {
  phone: string;
  driverId?: string;
  apiToken?: string;
  state: DriverState;
  registrationStep?: RegistrationStep;
  currentRideCode?: string;
  tempData?: Record<string, any>;
  lastMessageAt: number;
}

export interface StateTransition {
  newState: DriverState;
  registrationStep?: RegistrationStep;
  currentRideCode?: string;
  tempData?: Record<string, any>;
  action?: string; // API action to perform
}

import { Intent } from "./intent-matcher";

/**
 * Determine what state transition should happen based on current state + intent
 */
export function getTransition(
  state: DriverWhatsappState,
  intent: Intent,
): StateTransition | null {
  const s = state.state;

  switch (s) {
    case "unknown":
      if (intent === "DAFTAR") {
        return {
          newState: "registering",
          registrationStep: "name",
        };
      }
      if (intent === "BANTUAN") {
        return { newState: "unknown", action: "SHOW_HELP" };
      }
      // Anything else → prompt to register
      return { newState: "unknown", action: "NEED_REGISTRATION" };

    case "registering":
      // Registration is handled separately by the bridge
      return null;

    case "idle":
      if (intent === "GO_ONLINE") return { newState: "online", action: "GO_ONLINE" };
      if (intent === "PENGHASILAN") return { newState: "idle", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "idle", action: "SHOW_HELP" };
      if (intent === "TARIK") return { newState: "idle", action: "WITHDRAW" };
      if (intent === "DAFTAR") return { newState: "idle", action: "ALREADY_REGISTERED" };
      return null; // → AI fallback

    case "online":
      if (intent === "GO_OFFLINE") return { newState: "idle", action: "GO_OFFLINE" };
      if (intent === "PENGHASILAN") return { newState: "online", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "online", action: "SHOW_HELP" };
      if (intent === "TARIK") return { newState: "online", action: "WITHDRAW" };
      if (intent === "GO_ONLINE") return { newState: "online", action: "ALREADY_ONLINE" };
      if (intent === "DAFTAR") return { newState: "online", action: "ALREADY_REGISTERED" };
      return null; // → AI fallback

    case "offered":
      if (intent === "TERIMA") return { newState: "picking_up", action: "ACCEPT_RIDE" };
      if (intent === "TOLAK") return { newState: "online", action: "DECLINE_RIDE" };
      if (intent === "PENGHASILAN") return { newState: "offered", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "offered", action: "SHOW_HELP" };
      // Ignore other intents during offer
      return { newState: "offered", action: "WAITING_RESPONSE" };

    case "picking_up":
      if (intent === "TIBA") return { newState: "at_pickup", action: "ARRIVE_PICKUP" };
      if (intent === "PENGHASILAN") return { newState: "picking_up", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "picking_up", action: "SHOW_HELP" };
      return null; // → AI fallback (e.g., "orangnya gak ada")

    case "at_pickup":
      if (intent === "JEMPUT") return { newState: "on_ride", action: "START_RIDE" };
      if (intent === "PENGHASILAN") return { newState: "at_pickup", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "at_pickup", action: "SHOW_HELP" };
      return null; // → AI fallback

    case "on_ride":
      if (intent === "SELESAI") return { newState: "online", action: "COMPLETE_RIDE" };
      if (intent === "PENGHASILAN") return { newState: "on_ride", action: "SHOW_EARNINGS" };
      if (intent === "BANTUAN") return { newState: "on_ride", action: "SHOW_HELP" };
      return null; // → AI fallback

    default:
      return null;
  }
}

/**
 * Get the next registration step
 */
export function getNextRegistrationStep(currentStep: RegistrationStep): RegistrationStep {
  const steps: RegistrationStep[] = [
    "name",
    "vehicle_type",
    "vehicle_brand",
    "plate",
    "ktp",
    "sim",
    "payment_method",
    "payment_number",
    "confirm",
  ];
  const idx = steps.indexOf(currentStep);
  if (idx === -1 || idx >= steps.length - 1) return null;
  return steps[idx + 1];
}
