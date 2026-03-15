"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function DashboardPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedRideId, setSelectedRideId] = useState<any>(null);
  const [supportScenario, setSupportScenario] = useState<"driver_late" | "customer_cancel" | "refund_request">("driver_late");

  const rides = useQuery(api.rides.listRides, { status: statusFilter || undefined }) || [];
  const drivers = useQuery(api.drivers.listDrivers, { availability: undefined }) || [];
  const selectedRide = useQuery(api.rides.getRide, selectedRideId ? { rideId: selectedRideId } : "skip");
  const suggestions = useQuery(api.dispatch.dispatchSuggestions, selectedRideId ? { rideId: selectedRideId } : "skip") || [];
  const actions = useQuery(api.agentActions.listAgentActions, {}) || [];

  const createRide = useMutation(api.rides.createRide);
  const assignDriver = useMutation(api.rides.assignDriver);
  const updateRideStatus = useMutation(api.rides.updateRideStatus);
  // Payment QRIS generation is handled via Convex action/internalAction; for simplicity in this MVP UI,
  // we call a Next.js API route that proxies to Convex HTTP action/webhook stubs.
  const createPaymentQris = async ({ rideId }: { rideId: string }) => {
    const res = await fetch("/api/payments/qris", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rideId, provider: "xendit" }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };
  const setDriverAvailability = useMutation(api.drivers.setDriverAvailability);
  const updateDriverLocation = useMutation(api.drivers.updateDriverLocation);
  const logSupportAction = useMutation(api.dispatch.logSupportAction);
  const seedDemo = useMutation(api.seed.seedDemo);

  const selectedRideCode = useMemo(() => selectedRide?.ride.code || "-", [selectedRide]);

  const handleCreateRide = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const rideId = await createRide({
      customerName: String(form.get("customerName")),
      customerPhone: String(form.get("customerPhone")),
      pickup: {
        address: String(form.get("pickupAddress")),
        lat: Number(form.get("pickupLat")),
        lng: Number(form.get("pickupLng")),
        note: String(form.get("pickupNote") || ""),
      },
      dropoff: {
        address: String(form.get("dropoffAddress")),
        lat: Number(form.get("dropoffLat")),
        lng: Number(form.get("dropoffLng")),
        note: String(form.get("dropoffNote") || ""),
      },
      vehicleType: "motor",
      createdBy: "operator-dashboard",
    });

    setSelectedRideId(rideId);
    e.currentTarget.reset();
  };

  return (
    <main className="container grid" style={{ gap: 20 }}>
      <h1>Gojek Agentic MVP — Operator Dashboard</h1>

      <div className="grid grid-3">
        <section className="card">
          <h3>Create Ride</h3>
          <form onSubmit={handleCreateRide}>
            <label>Customer Name</label>
            <input name="customerName" required />
            <label>Customer Phone</label>
            <input name="customerPhone" required />
            <label>Pickup Address</label>
            <input name="pickupAddress" required />
            <label>Pickup Lat/Lng</label>
            <input name="pickupLat" type="number" step="any" required defaultValue={-6.2} />
            <input name="pickupLng" type="number" step="any" required defaultValue={106.816666} />
            <label>Dropoff Address</label>
            <input name="dropoffAddress" required />
            <label>Dropoff Lat/Lng</label>
            <input name="dropoffLat" type="number" step="any" required defaultValue={-6.22} />
            <input name="dropoffLng" type="number" step="any" required defaultValue={106.84} />
            <button type="submit">Create Ride</button>
          </form>
        </section>

        <section className="card">
          <h3>Rides</h3>
          <label>Filter status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            {[
              "dispatching",
              "assigned",
              "driver_arriving",
              "picked_up",
              "completed",
              "cancelled",
              "expired",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div style={{ maxHeight: 320, overflow: "auto" }}>
            {rides.map((ride) => (
              <div key={ride._id} className="card" style={{ marginBottom: 8, padding: 10 }}>
                <div>
                  <strong>{ride.code}</strong> <span className="badge">{ride.status}</span>
                </div>
                <div className="small">{ride.customerName} • Rp {ride.price.amount.toLocaleString("id-ID")}</div>
                <button className="secondary" onClick={() => setSelectedRideId(ride._id)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Driver Pool</h3>
          <button onClick={() => seedDemo({})}>Seed Demo Drivers</button>
          <div style={{ maxHeight: 320, overflow: "auto", marginTop: 10 }}>
            {drivers.map((d) => (
              <div key={d._id} className="card" style={{ marginBottom: 8, padding: 10 }}>
                <div>
                  <strong>{d.userName}</strong> <span className="badge">{d.availability}</span>
                </div>
                <div className="small">
                  {d.vehicleType} • {d.lastLocation.lat.toFixed(4)}, {d.lastLocation.lng.toFixed(4)}
                </div>
                <select value={d.availability} onChange={(e) => setDriverAvailability({ driverId: d._id, availability: e.target.value as any })}>
                  <option value="online">online</option>
                  <option value="offline">offline</option>
                  <option value="busy">busy</option>
                </select>
                <button className="secondary" onClick={() => updateDriverLocation({ driverId: d._id, lat: d.lastLocation.lat + 0.001, lng: d.lastLocation.lng + 0.001 })}>
                  Mock Move +0.001
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>Ride Detail: {selectedRideCode}</h2>
        {!selectedRide ? (
          <p className="small">Select a ride first.</p>
        ) : (
          <div className="grid grid-3">
            <div>
              <h4>Details</h4>
              <p>Status: {selectedRide.ride.status}</p>
              <p>Payment: {selectedRide.ride.paymentStatus}</p>
              <p>
                Assigned Driver: {selectedRide.driver?.userName || selectedRide.ride.assignedDriverId || "-"}
              </p>
              <button onClick={() => updateRideStatus({ rideId: selectedRide.ride._id, status: "driver_arriving", by: "operator-dashboard" })}>Mark Driver Arriving</button>
              <button onClick={() => updateRideStatus({ rideId: selectedRide.ride._id, status: "picked_up", by: "operator-dashboard" })}>Mark Picked Up</button>
              <button onClick={() => updateRideStatus({ rideId: selectedRide.ride._id, status: "completed", by: "operator-dashboard" })}>Mark Completed</button>
              <button
                className="secondary"
                onClick={async () => {
                  const out = await createPaymentQris({ rideId: String(selectedRide.ride._id) });
                  alert(`QRIS stub created: ${out?.id || "ok"}`);
                }}
              >
                Generate QRIS (Xendit stub)
              </button>
            </div>

            <div>
              <h4>Top 3 Driver Suggestions</h4>
              {suggestions.map((s) => (
                <div key={s.driverId} className="card" style={{ marginBottom: 8, padding: 10 }}>
                  <div>Score: {s.score}</div>
                  <div className="small">{s.reasoning}</div>
                  <button onClick={() => assignDriver({ rideId: selectedRide.ride._id, driverId: s.driverId, assignedBy: "operator-dashboard" })}>Assign</button>
                </div>
              ))}
            </div>

            <div>
              <h4>Support Agent</h4>
              <select value={supportScenario} onChange={(e) => setSupportScenario(e.target.value as any)}>
                <option value="driver_late">driver_late</option>
                <option value="customer_cancel">customer_cancel</option>
                <option value="refund_request">refund_request</option>
              </select>
              <button onClick={() => logSupportAction({ rideId: selectedRide.ride._id, scenario: supportScenario, approvedBy: "operator-dashboard" })}>
                Log Suggested Resolution
              </button>
              <h4 style={{ marginTop: 16 }}>Timeline</h4>
              <div style={{ maxHeight: 180, overflow: "auto" }}>
                {selectedRide.ride.timeline.map((t, i) => (
                  <div key={i} className="small">
                    {new Date(t.at).toLocaleString()} — {t.type} by {t.by}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Agent Actions Log</h3>
        <div style={{ maxHeight: 240, overflow: "auto" }}>
          {actions.map((a) => (
            <div key={a._id} className="small" style={{ marginBottom: 6 }}>
              [{new Date(a.createdAt).toLocaleString()}] {a.agentName} / {a.actionType} / ride: {String(a.rideId || "-")}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
