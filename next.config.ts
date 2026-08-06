import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The manual connector reads data/network.json at request time through a
   * path that can be overridden by env, so the bundler can't trace it. Include
   * the folder explicitly or the file goes missing on serverless hosts.
   */
  outputFileTracingIncludes: {
    "/": ["./data/**"],
    "/api/snapshot": ["./data/**"],
  },

  /**
   * Optional DB drivers are loaded at runtime and must not be bundled. Listing
   * them here is harmless when they aren't installed.
   */
  serverExternalPackages: ["pg", "mysql2", "mongodb"],
};

export default nextConfig;
