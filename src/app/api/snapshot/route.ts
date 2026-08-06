import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSnapshot } from "@/connectors";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only raw snapshot, for spot-checking connector output and for anything
 * downstream (a board deck, a spreadsheet) that wants the numbers as JSON.
 *
 *   GET /api/snapshot          cached snapshot
 *   GET /api/snapshot?force=1  re-run every connector now
 */
export async function GET(req: Request) {
  const role = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const snapshot = await getSnapshot(force);
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
