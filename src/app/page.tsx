import { Suspense } from "react";
import { Dashboard } from "@/components/Dashboard";
import type { Snapshot } from "@/lib/types";
import snapshot from "@/generated/snapshot.json";

/**
 * Static entry point.
 *
 * The snapshot is baked in at build time by scripts/build-snapshot.mjs — a
 * static host can't run the connectors per request. Everything below this is a
 * client component, because the filters read the URL and there's no server to
 * read it for them; `useSearchParams` needs the Suspense boundary for that
 * reason.
 */
export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard snapshot={snapshot as unknown as Snapshot} />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="min-h-dvh">
      <div className="topbar">
        <div className="shell py-4" style={{ height: 66 }} />
      </div>
      <div className="shell py-9">
        <div
          className="card"
          style={{ height: 320, opacity: 0.5 }}
          aria-label="Loading dashboard"
        />
      </div>
    </div>
  );
}
