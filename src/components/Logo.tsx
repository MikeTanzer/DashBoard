/**
 * The Pyrotree mark.
 *
 * Drawn in WebJoint's visual language — coral on navy, the same rounded-square
 * badge and generous radii used across their site — but it is deliberately NOT
 * their logo. Pyrotree is the parent company; borrowing the subsidiary's
 * wordmark would misattribute the whole dashboard.
 *
 * The form is a flame whose inner negative space reads as a leaf: pyro + tree,
 * one shape. Geometric enough to hold at 20px in a nav bar.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      <rect width="40" height="40" rx="11" fill="var(--coral)" />
      {/* Flame silhouette */}
      <path
        d="M20 7.5c4.9 4.6 8.2 8.6 8.2 13.3 0 5.2-3.7 9.2-8.2 9.2s-8.2-4-8.2-9.2c0-4.7 3.3-8.7 8.2-13.3z"
        fill="#ffffff"
        opacity="0.95"
      />
      {/* Leaf cut out of the flame — the "tree" half of the name */}
      <path
        d="M20 13.4c3.1 2.7 4.7 5.3 4.7 7.9 0 2.9-2.1 5.1-4.7 5.1s-4.7-2.2-4.7-5.1c0-2.6 1.6-5.2 4.7-7.9z"
        fill="var(--coral)"
      />
      <path
        d="M20 15.6v10.8"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M20 19.6l2.4-2.2M20 22.6l-2.4-2.2"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}
