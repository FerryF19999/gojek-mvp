import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/ops-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WaitlistPageProps = {
  searchParams: {
    key?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function LandingWaitlistAdminPage({ searchParams }: WaitlistPageProps) {
  const adminKey = process.env.WAITLIST_ADMIN_KEY || process.env.OPS_API_KEY;
  const provided = (searchParams?.key || "").trim();

  if (!adminKey || provided !== adminKey) {
    return (
      <main className="container py-10">
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <CardTitle>Waitlist Admin</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Unauthorized. Open this page with <code>?key=YOUR_ADMIN_KEY</code>.
          </CardContent>
        </Card>
      </main>
    );
  }

  const convex = getConvexClient();
  const entries = await convex.query(api.waitlist.list, {});

  return (
    <main className="container py-10">
      <Card>
        <CardHeader>
          <CardTitle>Waitlist Entries ({entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Company</th>
                <th className="p-2">Role</th>
                <th className="p-2">Note</th>
                <th className="p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry._id} className="border-b align-top">
                  <td className="p-2 font-medium">{entry.name}</td>
                  <td className="p-2">{entry.email}</td>
                  <td className="p-2">{entry.company || "-"}</td>
                  <td className="p-2">{entry.role || "-"}</td>
                  <td className="p-2">{entry.note || "-"}</td>
                  <td className="p-2">{new Date(entry.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 ? <p className="p-2 text-muted-foreground">No waitlist entries yet.</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
