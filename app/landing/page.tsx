"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const valueProps = [
  "End-to-end ride ops demo: dispatch, tracking, and payment in one flow",
  "Convex-first backend for realtime updates with low operational overhead",
  "Operator dashboard built for fast manual intervention and support actions",
  "Agentic-ready foundation to automate dispatch and exception handling",
];

export default function LandingPage() {
  const joinWaitlist = useMutation(api.waitlist.join);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const scrollToWaitlist = () => {
    document.getElementById("waitlist-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage(null);

    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);

    try {
      const result = await joinWaitlist({
        name: String(form.get("name") || ""),
        email: String(form.get("email") || ""),
        company: String(form.get("company") || ""),
        role: String(form.get("role") || ""),
        note: String(form.get("note") || ""),
      });

      const message = result.alreadyJoined
        ? "You are already on the waitlist. We'll keep you posted."
        : "Thanks! You're on the waitlist. We'll contact you soon.";

      setSuccessMessage(message);
      toast.success(message);
      event.currentTarget.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to join waitlist";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="container py-10">
      <section className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight">Gojek Agentic MVP</h1>
          <p className="text-muted-foreground">
            Lightweight operations stack for modern ride-hailing demos — designed for fast prototyping and real-time coordination.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why this MVP</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {valueProps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={scrollToWaitlist}>Join waitlist</Button>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Open dashboard
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Docs</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>Read technical docs and API notes at the docs page.</p>
            <Link href="/docs" className={buttonVariants({ variant: "ghost" }) + " mt-3 px-0"}>
              Go to /docs
            </Link>
          </CardContent>
        </Card>

        <Card id="waitlist-form">
          <CardHeader>
            <CardTitle>Waitlist Signup</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <Input name="name" placeholder="Name" required />
              <Input name="email" type="email" placeholder="Email" required />
              <Input name="company" placeholder="Company (optional)" />
              <Input name="role" placeholder="Role (optional)" />
              <textarea
                name="note"
                placeholder="Note (optional)"
                className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Submitting..." : "Join waitlist"}
              </Button>
            </form>
            {successMessage ? <p className="mt-3 text-sm text-emerald-600">{successMessage}</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
