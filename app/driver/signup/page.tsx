"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export default function DriverSignupPage() {
  const [applicationId, setApplicationId] = useState<any>(null);
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const submitApplication = useMutation(api.driverSignup.submitDriverApplication);
  const verifyOtp = useMutation(api.driverSignup.verifyDriverApplicationOtp);
  const activateSubscription = useMutation(api.driverSignup.activateDriverSubscriptionDemo);
  const appData = useQuery(api.driverSignup.getDriverApplication, applicationId ? { applicationId } : "skip");

  const handleSubmitApplication = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setIsSubmitting(true);

    try {
      const out = await submitApplication({
        fullName: String(form.get("fullName") || ""),
        phone: String(form.get("phone") || ""),
        email: String(form.get("email") || "") || undefined,
        city: String(form.get("city") || ""),
        vehicleType: String(form.get("vehicleType") || "motor") as "motor" | "car",
        vehicleBrand: String(form.get("vehicleBrand") || ""),
        vehicleModel: String(form.get("vehicleModel") || ""),
        vehiclePlate: String(form.get("vehiclePlate") || ""),
        licenseNumber: String(form.get("licenseNumber") || ""),
        emergencyContactName: String(form.get("emergencyContactName") || ""),
        emergencyContactPhone: String(form.get("emergencyContactPhone") || ""),
        referralCode: String(form.get("referralCode") || "") || undefined,
      });
      setApplicationId(out.applicationId);
      setOtpHint(out.otpHint ?? null);
      toast.success("Form terkirim. Verifikasi OTP untuk lanjut.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal kirim pendaftaran");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!applicationId) return;
    setIsVerifying(true);
    try {
      const out = await verifyOtp({ applicationId, otpCode });
      if (out?.alreadyVerified) {
        toast.success("OTP sudah terverifikasi sebelumnya.");
      } else {
        toast.success("OTP valid. Akun driver dibuat, status pending pembayaran.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "OTP tidak valid");
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePaySubscriptionDemo = async () => {
    if (!applicationId) return;
    setIsPaying(true);
    try {
      const out = await activateSubscription({ applicationId });
      toast.success(`Pembayaran berhasil. Driver aktif sampai ${new Date(out.subscribedUntil).toLocaleString("id-ID")}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal aktivasi langganan");
    } finally {
      setIsPaying(false);
    }
  };

  const status = appData?.application?.status;

  return (
    <main className="container mx-auto max-w-3xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Driver Signup</CardTitle>
          <p className="text-sm text-muted-foreground">
            Alur MVP: isi data → verifikasi OTP dummy → bayar langganan Rp {DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY.toLocaleString("id-ID")}/bulan.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmitApplication} className="grid gap-3 md:grid-cols-2">
            <Input name="fullName" placeholder="Nama lengkap" required />
            <Input name="phone" placeholder="No HP aktif" required />
            <Input name="email" type="email" placeholder="Email (opsional)" />
            <Input name="city" placeholder="Kota domisili" required />
            <Select name="vehicleType" defaultValue="motor" required>
              <option value="motor">Motor</option>
              <option value="car">Mobil</option>
            </Select>
            <Input name="vehicleBrand" placeholder="Merek kendaraan" required />
            <Input name="vehicleModel" placeholder="Tipe/model kendaraan" required />
            <Input name="vehiclePlate" placeholder="Nomor polisi" required />
            <Input name="licenseNumber" placeholder="Nomor SIM" required />
            <Input name="emergencyContactName" placeholder="Nama kontak darurat" required />
            <Input name="emergencyContactPhone" placeholder="No HP kontak darurat" required />
            <Input name="referralCode" placeholder="Kode referral (opsional)" />
            <Button type="submit" className="md:col-span-2" disabled={isSubmitting}>
              {isSubmitting ? "Mengirim..." : "Daftar & Kirim OTP"}
            </Button>
          </form>

          {applicationId ? (
            <div className="rounded-md border p-4 space-y-3">
              <p className="text-sm font-medium">Langkah 2 — Verifikasi OTP</p>
              <p className="text-xs text-muted-foreground">
                Demo OTP (ditampilkan untuk testing UI): <span className="font-mono font-semibold">{otpHint || "123456"}</span>
              </p>
              <div className="flex gap-2">
                <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="Masukkan OTP" maxLength={6} />
                <Button onClick={handleVerifyOtp} disabled={isVerifying || otpCode.length < 6}>
                  {isVerifying ? "Verifikasi..." : "Verifikasi OTP"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Status aplikasi: {status || "otp_pending"}</p>
            </div>
          ) : null}

          {status === "pending_payment" || status === "active" ? (
            <div className="rounded-md border p-4 space-y-3">
              <p className="text-sm font-medium">Langkah 3 — Aktivasi Langganan</p>
              <p className="text-sm text-muted-foreground">
                Driver belum eligible dispatch sebelum langganan aktif.
              </p>
              <Button onClick={handlePaySubscriptionDemo} disabled={isPaying || status === "active"}>
                {status === "active"
                  ? "Langganan Aktif"
                  : isPaying
                    ? "Memproses pembayaran..."
                    : `Bayar Demo Rp ${DRIVER_SUBSCRIPTION_PRICE_IDR_MONTHLY.toLocaleString("id-ID")}`}
              </Button>
              {appData?.driver ? (
                <p className="text-xs text-muted-foreground">
                  Driver ID: <span className="font-mono">{String(appData.driver._id)}</span> • subscriptionStatus: {appData.driver.subscriptionStatus || "inactive"}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
