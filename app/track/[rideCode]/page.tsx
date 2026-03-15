"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const TrackingMap = dynamic(() => import("./TrackingMap"), { ssr: false });

export default function TrackRidePage() {
  const params = useParams();
  const rideCode = params.rideCode as string;

  const ride = useQuery(api.rides.getRideByCode, { code: rideCode });

  if (ride === undefined) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4" />
          <p className="text-lg">Memuat tracking {rideCode}...</p>
        </div>
      </div>
    );
  }

  if (ride === null) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-2xl mb-2">🚫</p>
          <p className="text-lg font-semibold">Ride tidak ditemukan</p>
          <p className="text-gray-400 mt-1">Kode: {rideCode}</p>
        </div>
      </div>
    );
  }

  return <TrackingMap ride={ride} />;
}
