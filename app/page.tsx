"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RideList } from "@/components/dashboard/RideList";
import { RideDetail } from "@/components/dashboard/RideDetail";
import { DriverTable } from "@/components/dashboard/DriverTable";
import { SuggestionCards } from "@/components/dashboard/SuggestionCards";
import { StatusTimeline } from "@/components/dashboard/StatusTimeline";
import { PaymentPanel } from "@/components/dashboard/PaymentPanel";

export default function DashboardPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedRideId, setSelectedRideId] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [supportScenario, setSupportScenario] = useState<"driver_late" | "customer_cancel" | "refund_request">("driver_late");
  const [isQrisLoading, setIsQrisLoading] = useState(false);
  const [selectNewestOnNextSync, setSelectNewestOnNextSync] = useState(false);

  const connectionState = useConvexConnectionState();
  const isConnected = connectionState?.isWebSocketConnected ?? false;

  const rides = useQuery(api.rides.listRides, { status: statusFilter || undefined }) || [];
  const drivers = useQuery(api.drivers.listDrivers, { availability: undefined }) || [];
  const selectedRide = useQuery(api.rides.getRide, selectedRideId ? { rideId: selectedRideId } : "skip");
  const suggestions = useQuery(api.dispatch.dispatchSuggestions, selectedRideId ? { rideId: selectedRideId } : "skip") || [];
  const actions = useQuery(api.agentActions.listAgentActions, {}) || [];

  const createRide = useMutation(api.rides.createRide);
  const assignDriver = useMutation(api.rides.assignDriver);
  const updateRideStatus = useMutation(api.rides.updateRideStatus);
  const setDriverAvailability = useMutation(api.drivers.setDriverAvailability);
  const updateDriverLocation = useMutation(api.drivers.updateDriverLocation);
  const logSupportAction = useMutation(api.dispatch.logSupportAction);
  const seedDemo = useMutation(api.seed.seedDemo);
  const startRideAgent = useMutation(api.rideAgent.startRideAgent);
  const stopRideAgent = useMutation(api.rideAgent.stopRideAgent);

  const createPaymentQris = async ({ rideId }: { rideId: string }) => {
    const res = await fetch("/api/payments/qris", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rideId, provider: "xendit" }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const filteredRides = useMemo(() => {
    if (!search.trim()) return rides;
    const q = search.toLowerCase();
    return rides.filter((r) => r.code.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q));
  }, [rides, search]);

  useEffect(() => {
    if (!selectNewestOnNextSync || rides.length === 0) return;
    setSelectedRideId(rides[0]?._id ?? null);
    setSelectNewestOnNextSync(false);
  }, [rides, selectNewestOnNextSync]);

  const handleCreateRide = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
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
      if (rideId) {
        setSelectedRideId(rideId);
      } else {
        setSelectNewestOnNextSync(true);
      }
      e.currentTarget.reset();
      toast.success("Ride created successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create ride");
    }
  };

  return (
    <main className="container py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gojek Agentic Operator Dashboard</h1>
          <p className="text-sm text-muted-foreground">Dispatch rides, assign drivers, and monitor status in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              isConnected ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {isConnected ? "Connected" : "Disconnected"}
          </span>
          <ThemeToggle />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Create Ride</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateRide} className="space-y-2">
              <Input name="customerName" placeholder="Customer name" required />
              <Input name="customerPhone" placeholder="Customer phone" required />
              <Input name="pickupAddress" placeholder="Pickup address" required />
              <div className="grid gap-2 md:grid-cols-2">
                <Input name="pickupLat" type="number" step="any" required defaultValue={-6.2} />
                <Input name="pickupLng" type="number" step="any" required defaultValue={106.816666} />
              </div>
              <Input name="dropoffAddress" placeholder="Dropoff address" required />
              <div className="grid gap-2 md:grid-cols-2">
                <Input name="dropoffLat" type="number" step="any" required defaultValue={-6.22} />
                <Input name="dropoffLng" type="number" step="any" required defaultValue={106.84} />
              </div>
              <Button type="submit" className="w-full">Create ride</Button>
            </form>
          </CardContent>
        </Card>

        <RideList
          rides={filteredRides}
          loading={!rides}
          statusFilter={statusFilter}
          search={search}
          onStatusFilter={setStatusFilter}
          onSearch={setSearch}
          onSelect={setSelectedRideId}
        />

        <DriverTable
          drivers={drivers}
          loading={!drivers}
          onSeed={async () => {
            try {
              await seedDemo({});
              toast.success("Demo drivers seeded");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to seed drivers");
            }
          }}
          onAvailability={async (driverId, availability) => {
            try {
              await setDriverAvailability({ driverId, availability });
              toast.success("Driver availability updated");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to update driver");
            }
          }}
          onMove={async (driverId, lat, lng) => {
            try {
              await updateDriverLocation({ driverId, lat, lng });
              toast.success("Driver location updated");
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Failed to move driver");
            }
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {!selectedRide ? (
          <Card className="xl:col-span-3">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">Select a ride to view details, suggestions, payment, and timeline.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <RideDetail
              ride={selectedRide.ride}
              driverName={selectedRide.driver?.userName || selectedRide.ride.assignedDriverId || "-"}
              onStartAgent={async () => {
                try {
                  const out = await startRideAgent({ rideId: selectedRide.ride._id });
                  if (out?.alreadyRunning) {
                    toast.success("Ride agent already running");
                  } else {
                    toast.success("Ride agent started");
                  }
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to start ride agent");
                }
              }}
              onStopAgent={async () => {
                try {
                  await stopRideAgent({ rideId: selectedRide.ride._id });
                  toast.success("Ride agent stopped");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to stop ride agent");
                }
              }}
              onSetStatus={async (status) => {
                try {
                  await updateRideStatus({ rideId: selectedRide.ride._id, status, by: "operator-dashboard" });
                  const statusLabel: Record<string, string> = {
                    driver_arriving: "Driver arriving",
                    picked_up: "Picked up",
                    completed: "Completed",
                  };
                  toast.success(`Ride status updated: ${statusLabel[status] || status}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to update status");
                }
              }}
            />

            <SuggestionCards
              suggestions={suggestions}
              loading={!suggestions}
              onAssign={async (driverId) => {
                try {
                  await assignDriver({ rideId: selectedRide.ride._id, driverId, assignedBy: "operator-dashboard" });
                  toast.success("Driver assigned");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Failed to assign driver");
                }
              }}
            />

            <div className="space-y-4">
              <PaymentPanel
                loading={isQrisLoading}
                paymentStatus={selectedRide.ride.paymentStatus}
                onGenerate={async () => {
                  setIsQrisLoading(true);
                  try {
                    const out = await createPaymentQris({ rideId: String(selectedRide.ride._id) });
                    toast.success(`QRIS stub created: ${out?.id || "ok"}`);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Failed to create QRIS");
                  } finally {
                    setIsQrisLoading(false);
                  }
                }}
              />

              <Card>
                <CardHeader>
                  <CardTitle>Support Agent</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Select value={supportScenario} onChange={(e) => setSupportScenario(e.target.value as any)}>
                    <option value="driver_late">driver_late</option>
                    <option value="customer_cancel">customer_cancel</option>
                    <option value="refund_request">refund_request</option>
                  </Select>
                  <Button
                    className="w-full"
                    onClick={async () => {
                      try {
                        const out = await logSupportAction({
                          rideId: selectedRide.ride._id,
                          scenario: supportScenario,
                          approvedBy: "operator-dashboard",
                        });
                        toast.success(
                          out?.suggestion
                            ? `Suggested resolution logged: ${out.suggestion}`
                            : "Support action logged successfully",
                        );
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "Failed to log support action");
                      }
                    }}
                  >
                    Log suggested resolution
                  </Button>
                </CardContent>
              </Card>

              <StatusTimeline timeline={selectedRide.ride.timeline} />
            </div>
          </>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Agent Actions Log</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[260px] space-y-1 overflow-auto text-sm text-muted-foreground">
          {actions.length === 0 ? <p>No actions yet.</p> : null}
          {actions.map((a) => (
            <p key={a._id}>
              [{new Date(a.createdAt).toLocaleString()}] {a.agentName} / {a.actionType} / ride: {String(a.rideId || "-")}
            </p>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
