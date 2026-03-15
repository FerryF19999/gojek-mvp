/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentActions from "../agentActions.js";
import type * as dispatch from "../dispatch.js";
import type * as driverSignup from "../driverSignup.js";
import type * as driverView from "../driverView.js";
import type * as drivers from "../drivers.js";
import type * as geo from "../geo.js";
import type * as geocodes from "../geocodes.js";
import type * as http from "../http.js";
import type * as payments from "../payments.js";
import type * as publicApi from "../publicApi.js";
import type * as rideAgent from "../rideAgent.js";
import type * as rides from "../rides.js";
import type * as seed from "../seed.js";
import type * as stats from "../stats.js";
import type * as subscription from "../subscription.js";
import type * as waitlist from "../waitlist.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentActions: typeof agentActions;
  dispatch: typeof dispatch;
  driverSignup: typeof driverSignup;
  driverView: typeof driverView;
  drivers: typeof drivers;
  geo: typeof geo;
  geocodes: typeof geocodes;
  http: typeof http;
  payments: typeof payments;
  publicApi: typeof publicApi;
  rideAgent: typeof rideAgent;
  rides: typeof rides;
  seed: typeof seed;
  stats: typeof stats;
  subscription: typeof subscription;
  waitlist: typeof waitlist;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
