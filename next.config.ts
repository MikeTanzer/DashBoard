import type { NextConfig } from "next";

/**
 * Static export, for GitHub Pages.
 *
 * Pages serves files and runs nothing, so this build has no server rendering,
 * no route handlers and no per-request data fetching. The snapshot is baked in
 * by scripts/build-snapshot.mjs and every filter runs in the browser.
 *
 * BASE_PATH is the repository name, because Pages serves a project site under
 * /<repo>/. It's set by the deploy workflow; locally it's empty so `next dev`
 * still runs at the root.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  // No server means no image optimiser.
  images: { unoptimized: true },
  // Pages serves /path/ as /path/index.html.
  trailingSlash: true,
};

export default nextConfig;
