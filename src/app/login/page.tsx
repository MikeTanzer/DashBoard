import { Logo } from "@/components/Logo";

export const metadata = { title: "Sign in — Pyrotree" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <main className="min-h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <Logo size={30} />
          <div>
            <div className="font-semibold leading-tight">Pyrotree</div>
            <div
              className="text-xs leading-tight"
              style={{ color: "var(--text-muted)" }}
            >
              Network Dashboard
            </div>
          </div>
        </div>

        <form action="/api/auth" method="POST" className="card p-6">
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-2"
          >
            Access password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoFocus
            required
            autoComplete="current-password"
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <input type="hidden" name="next" value={next ?? "/"} />

          {error ? (
            <p
              className="text-xs mt-2.5 flex items-center gap-1.5"
              style={{ color: "var(--status-critical)" }}
            >
              <span aria-hidden="true">▲</span> That password isn&apos;t right.
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full mt-4 rounded-lg px-3 py-2.5 text-sm font-semibold"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            Sign in
          </button>
        </form>

        <p
          className="text-xs text-center mt-4"
          style={{ color: "var(--text-muted)" }}
        >
          Confidential. Investor and admin access only.
        </p>
      </div>
    </main>
  );
}
