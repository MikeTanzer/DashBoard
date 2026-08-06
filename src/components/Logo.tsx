export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {/* A tree canopy over a flame — pyro + tree. */}
      <path
        d="M16 2.5c3.4 3.6 5.2 6.6 5.2 9.3 0 1.6-.6 3-1.6 4 .5-1.7.2-3.3-1-4.7-.2 2.6-1.4 3.9-2.9 5.4-1.6 1.6-2.6 3-2.6 4.9 0 1 .3 1.9.9 2.7-2.7-1-4.6-3.6-4.6-6.7 0-4.7 3.9-8.1 6.6-14.9z"
        fill="var(--brand)"
      />
      <path
        d="M15 24h2v6h-2z"
        fill="var(--text-secondary)"
      />
      <path
        d="M16 21.5c2.2 0 4 1.4 4 3.2 0 1.8-1.8 3.3-4 3.3s-4-1.5-4-3.3c0-1.8 1.8-3.2 4-3.2z"
        fill="var(--series-3)"
        opacity="0.9"
      />
    </svg>
  );
}
