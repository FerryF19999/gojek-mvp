import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export default function DocsPage() {
  return (
    <main className="container py-10">
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Docs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Core implementation docs live in the repository under <code>docs/</code>.</p>
          <ul className="list-disc pl-5">
            <li><code>docs/ops-api.md</code> for operator API details.</li>
            <li><code>README.md</code> for setup and architecture notes.</li>
          </ul>
          <Link href="/landing" className={buttonVariants({ variant: "outline" })}>
            Back to landing
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
