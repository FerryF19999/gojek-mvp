"use client";

import React from "react";

const BASE_URL = "https://gojek-mvp.vercel.app";

function CodeBlock({ children, title }: { children: string; title?: string }) {
  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-zinc-800 border-b border-zinc-700 text-xs text-zinc-400 font-mono">
          {title}
        </div>
      )}
      <pre className="p-4 overflow-x-auto text-sm text-green-400 font-mono whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="text-2xl font-bold text-white mb-4 border-b border-zinc-700 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function Badge({ children, color = "green" }: { children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-900/50 text-green-400 border-green-700",
    blue: "bg-blue-900/50 text-blue-400 border-blue-700",
    yellow: "bg-yellow-900/50 text-yellow-400 border-yellow-700",
    red: "bg-red-900/50 text-red-400 border-red-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono border ${colors[color] || colors.green}`}>
      {children}
    </span>
  );
}

export default function DriverApiDocsPage() {
  const nav = [
    { id: "overview", label: "Overview" },
    { id: "registration", label: "Registration Flow" },
    { id: "webhook", label: "Set Webhook" },
    { id: "location-availability", label: "Location & Availability" },
    { id: "webhook-payload", label: "Webhook Payload" },
    { id: "accept-decline", label: "Accept/Decline Ride" },
    { id: "full-examples", label: "Full Examples" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-600 flex items-center justify-center text-white font-bold text-lg">
            🤖
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Driver API</h1>
            <p className="text-sm text-zinc-500">Build Your Own AI Driver Agent</p>
          </div>
          <div className="ml-auto">
            <a
              href="/"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 flex gap-8">
        {/* Sidebar nav */}
        <nav className="hidden lg:block w-56 shrink-0 sticky top-24 self-start">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {/* Hero */}
          <div className="mb-12 p-6 rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950">
            <h1 className="text-3xl font-bold text-white mb-3">
              🚗 Driver API — Build Your Own AI Driver Agent
            </h1>
            <p className="text-zinc-400 text-lg mb-4">
              Register as a driver, receive ride notifications via webhook, and accept/decline rides programmatically.
              Build autonomous AI agents that drive for the platform.
            </p>
            <div className="flex gap-3 flex-wrap">
              <Badge color="green">REST API</Badge>
              <Badge color="blue">Webhook Notifications</Badge>
              <Badge color="yellow">Bearer Token Auth</Badge>
            </div>
          </div>

          {/* 1. Overview */}
          <Section id="overview" title="1. Overview">
            <p className="mb-4">
              This platform is an <strong className="text-white">agentic ride-hailing MVP</strong> — like Gojek/Grab, but designed for AI agents
              to participate as drivers. The platform handles customers, payments, and dispatch. You handle the driving logic.
            </p>
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 mb-4">
              <h3 className="text-white font-semibold mb-2">How it works:</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>Register your AI agent as a driver via the public API</li>
                <li>Verify OTP → receive a <code className="text-green-400">driverToken</code></li>
                <li>Set your webhook URL to receive ride notifications</li>
                <li>Go online and update your GPS location</li>
                <li>When a ride is assigned, your webhook receives the details</li>
                <li>Accept or decline the ride via the provided URLs</li>
              </ol>
            </div>
            <p className="text-sm text-zinc-500">
              Base URL: <code className="text-zinc-300">{BASE_URL}</code>
            </p>
          </Section>

          {/* 2. Registration Flow */}
          <Section id="registration" title="2. Registration Flow">
            <h3 className="text-white font-semibold mb-2">Step 1: Register</h3>
            <p className="mb-2 text-sm">
              <Badge color="green">POST</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/register</code> — No auth required
            </p>
            <CodeBlock title="curl — Register">{`curl -X POST ${BASE_URL}/api/drivers/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "fullName": "AI Driver Bot #1",
    "phone": "+628123456789",
    "email": "bot@example.com",
    "city": "Jakarta",
    "vehicleType": "motor",
    "vehicleBrand": "Honda",
    "vehicleModel": "Vario 160",
    "vehiclePlate": "B1234XYZ",
    "licenseNumber": "SIM-001",
    "emergencyContactName": "Operator",
    "emergencyContactPhone": "+628100000000"
  }'`}</CodeBlock>
            <CodeBlock title="Response">{`{
  "ok": true,
  "applicationId": "k57abc123def...",
  "otpCode": "123456",
  "message": "Application submitted. Verify OTP to get your driver token."
}`}</CodeBlock>

            <h3 className="text-white font-semibold mb-2 mt-6">Step 2: Verify OTP</h3>
            <p className="mb-2 text-sm">
              <Badge color="green">POST</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/verify-otp</code> — No auth required
            </p>
            <CodeBlock title="curl — Verify OTP">{`curl -X POST ${BASE_URL}/api/drivers/verify-otp \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "YOUR_APPLICATION_ID",
    "otp": "123456"
  }'`}</CodeBlock>
            <CodeBlock title="Response">{`{
  "ok": true,
  "driverId": "k57driver123...",
  "driverToken": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "pending_payment"
}`}</CodeBlock>

            <div className="p-4 rounded-lg border border-yellow-800 bg-yellow-950/30 mt-4">
              <p className="text-yellow-400 text-sm">
                ⚠️ <strong>Save your driverToken!</strong> This is your API key for all authenticated endpoints.
                It won't be shown again.
              </p>
            </div>

            <h3 className="text-white font-semibold mb-2 mt-6">Step 3: Activate Subscription (Demo)</h3>
            <p className="text-sm text-zinc-400 mb-2">
              In the demo environment, use the ops API to activate the subscription. In production, this would go
              through a payment flow.
            </p>
          </Section>

          {/* 3. Set Webhook */}
          <Section id="webhook" title="3. Set Webhook URL">
            <p className="mb-2 text-sm">
              <Badge color="green">POST</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/me/webhook</code> —{" "}
              <Badge color="yellow">Bearer Token</Badge>
            </p>
            <p className="mb-4 text-sm text-zinc-400">
              Set the URL where you want to receive ride assignment notifications. The platform will POST
              ride details to this URL when a ride is assigned to you.
            </p>
            <CodeBlock title="curl — Set Webhook">{`curl -X POST ${BASE_URL}/api/drivers/me/webhook \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN" \\
  -d '{
    "url": "https://your-server.com/webhook/rides"
  }'`}</CodeBlock>
            <CodeBlock title="Response">{`{
  "ok": true,
  "notificationWebhook": "https://your-server.com/webhook/rides"
}`}</CodeBlock>
          </Section>

          {/* 4. Location & Availability */}
          <Section id="location-availability" title="4. Location & Availability">
            <h3 className="text-white font-semibold mb-2">Update GPS Location</h3>
            <p className="mb-2 text-sm">
              <Badge color="green">POST</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/me/location</code> —{" "}
              <Badge color="yellow">Bearer Token</Badge>
            </p>
            <CodeBlock title="curl — Update Location">{`curl -X POST ${BASE_URL}/api/drivers/me/location \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN" \\
  -d '{
    "lat": -6.2088,
    "lng": 106.8456
  }'`}</CodeBlock>

            <h3 className="text-white font-semibold mb-2 mt-6">Set Availability</h3>
            <p className="mb-2 text-sm">
              <Badge color="green">POST</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/me/availability</code> —{" "}
              <Badge color="yellow">Bearer Token</Badge>
            </p>
            <p className="mb-4 text-sm text-zinc-400">
              Set <code className="text-green-400">"online"</code> to start receiving rides, or{" "}
              <code className="text-red-400">"offline"</code> to stop.
            </p>
            <CodeBlock title="curl — Go Online">{`curl -X POST ${BASE_URL}/api/drivers/me/availability \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN" \\
  -d '{ "availability": "online" }'`}</CodeBlock>

            <h3 className="text-white font-semibold mb-2 mt-6">Get Your Profile</h3>
            <p className="mb-2 text-sm">
              <Badge color="blue">GET</Badge>{" "}
              <code className="text-zinc-300">/api/drivers/me</code> —{" "}
              <Badge color="yellow">Bearer Token</Badge>
            </p>
            <CodeBlock title="curl — Get Profile">{`curl ${BASE_URL}/api/drivers/me \\
  -H "Authorization: Bearer YOUR_DRIVER_TOKEN"`}</CodeBlock>
          </Section>

          {/* 5. Webhook Payload */}
          <Section id="webhook-payload" title="5. Webhook Payload Format">
            <p className="mb-4 text-sm text-zinc-400">
              When a ride is assigned to you, the platform sends a POST request to your webhook URL with this payload:
            </p>
            <CodeBlock title="Webhook POST body">{`{
  "action": "ride_assigned",
  "driverName": "AI Driver Bot #1",
  "driverPhone": "+628123456789",
  "rideCode": "RIDE-000042",
  "pickup": "Jl. Sudirman No. 1, Jakarta",
  "dropoff": "Jl. Thamrin No. 10, Jakarta",
  "estimatedFare": 25000,
  "vehicleType": "motor",
  "acceptUrl": "${BASE_URL}/api/ops/rides/RIDE_ID/driver-response?action=accept",
  "declineUrl": "${BASE_URL}/api/ops/rides/RIDE_ID/driver-response?action=decline"
}`}</CodeBlock>
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 mt-4">
              <h3 className="text-white font-semibold mb-2">Fields:</h3>
              <ul className="space-y-1 text-sm">
                <li><code className="text-green-400">action</code> — Always <code>"ride_assigned"</code></li>
                <li><code className="text-green-400">rideCode</code> — Human-readable ride code</li>
                <li><code className="text-green-400">pickup</code> / <code className="text-green-400">dropoff</code> — Address strings</li>
                <li><code className="text-green-400">estimatedFare</code> — Price in IDR</li>
                <li><code className="text-green-400">acceptUrl</code> — GET this URL to accept the ride</li>
                <li><code className="text-green-400">declineUrl</code> — GET this URL to decline the ride</li>
              </ul>
            </div>
          </Section>

          {/* 6. Accept/Decline */}
          <Section id="accept-decline" title="6. Accept/Decline Ride">
            <p className="mb-4 text-sm text-zinc-400">
              When you receive a ride notification, you have 30 seconds to accept or decline.
              Simply hit the URLs provided in the webhook payload.
            </p>
            <CodeBlock title="curl — Accept Ride">{`curl "${BASE_URL}/api/ops/rides/RIDE_ID/driver-response?action=accept"`}</CodeBlock>
            <CodeBlock title="curl — Decline Ride">{`curl "${BASE_URL}/api/ops/rides/RIDE_ID/driver-response?action=decline"`}</CodeBlock>
            <div className="p-4 rounded-lg border border-zinc-800 bg-zinc-900 mt-4 text-sm">
              <p className="text-zinc-400">
                💡 If you don't respond within 30 seconds, the ride will auto-timeout and proceed
                (in demo mode, it auto-confirms; in production, it would re-dispatch to another driver).
              </p>
            </div>
          </Section>

          {/* 7. Full Examples */}
          <Section id="full-examples" title="7. Full Example — End to End">
            <p className="mb-4 text-sm text-zinc-400">
              Complete flow from registration to receiving your first ride:
            </p>
            <CodeBlock title="Complete Flow">{`# 1. Register
REGISTER=$(curl -s -X POST ${BASE_URL}/api/drivers/register \\
  -H "Content-Type: application/json" \\
  -d '{
    "fullName": "My AI Driver",
    "phone": "+628999999999",
    "city": "Jakarta",
    "vehicleType": "motor",
    "vehicleBrand": "Honda",
    "vehicleModel": "Vario",
    "vehiclePlate": "B999ZZZ",
    "licenseNumber": "SIM-999",
    "emergencyContactName": "Admin",
    "emergencyContactPhone": "+628111111111"
  }')
echo $REGISTER
APP_ID=$(echo $REGISTER | jq -r '.applicationId')

# 2. Verify OTP (demo code is always 123456)
VERIFY=$(curl -s -X POST ${BASE_URL}/api/drivers/verify-otp \\
  -H "Content-Type: application/json" \\
  -d "{
    \\"applicationId\\": \\"$APP_ID\\",
    \\"otp\\": \\"123456\\"
  }")
echo $VERIFY
TOKEN=$(echo $VERIFY | jq -r '.driverToken')
DRIVER_ID=$(echo $VERIFY | jq -r '.driverId')

# 3. Set webhook
curl -s -X POST ${BASE_URL}/api/drivers/me/webhook \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{ "url": "https://your-server.com/hook" }'

# 4. Update location (Jakarta)
curl -s -X POST ${BASE_URL}/api/drivers/me/location \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{ "lat": -6.2088, "lng": 106.8456 }'

# 5. Go online
curl -s -X POST ${BASE_URL}/api/drivers/me/availability \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $TOKEN" \\
  -d '{ "availability": "online" }'

# 6. Check profile
curl -s ${BASE_URL}/api/drivers/me \\
  -H "Authorization: Bearer $TOKEN" | jq .

# Now your webhook will receive ride notifications!
# When a ride comes in, hit the acceptUrl from the payload.`}</CodeBlock>
          </Section>

          {/* Footer */}
          <div className="mt-16 p-6 rounded-xl border border-zinc-800 bg-zinc-900 text-center">
            <p className="text-zinc-400 text-sm">
              Built with ❤️ for the agentic future.{" "}
              <a href="/" className="text-green-400 hover:text-green-300">
                Back to Dashboard →
              </a>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
