import { NextResponse } from "next/server";
import { getSnapshot } from "@/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw snapshot, for spot-checking connector output and for anything downstream
 * (a board deck, a spreadsheet) that wants the numbers as JSON.
 *
 * There is no login on this app, so this route is OFF unless you turn it on.
 * It returns every customer by name with their revenue — the single most
 * sensitive thing here — and an unauthenticated dump of that is a different
 * proposition from an unauthenticated dashboard.
 *
 *   PYROTREE_SNAPSHOT_API=open              anyone who knows the URL
 *   PYROTREE_SNAPSHOT_API=<a long secret>   callers must send it
 *
 * With a secret set:  GET /api/snapshot?key=<secret>
 *                 or  Authorization: Bearer <secret>
 *
 *   ?force=1   re-run every connector now instead of using the cache
 */
export async function GET(req: Request) {
  const configured = process.env.PYROTREE_SNAPSHOT_API;

  if (!configured) {
    return NextResponse.json(
      {
        error: "disabled",
        detail:
          "This endpoint returns customer names and revenue. Set PYROTREE_SNAPSHOT_API to a long random secret to enable it, or to 'open' to allow anyone with the URL.",
      },
      { status: 404 },
    );
  }

  const url = new URL(req.url);

  if (configured !== "open") {
    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const supplied = url.searchParams.get("key") ?? bearer ?? "";
    if (!timingSafeEqual(supplied, configured)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const snapshot = await getSnapshot(url.searchParams.get("force") === "1");
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

/** Length-independent comparison, so a wrong key can't be timed out of us. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}
