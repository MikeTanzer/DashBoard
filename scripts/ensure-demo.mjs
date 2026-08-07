#!/usr/bin/env node
/**
 * Seeds data/network.json with demo data ONLY when the file is absent.
 *
 * Runs before every build. On a fresh checkout — a Vercel deploy, a new clone —
 * the file doesn't exist (it's gitignored, because it holds customer names and
 * revenue), so without this the deployed dashboard reports every metric as
 * untracked.
 *
 * The existence check is the important part: once real records are in that
 * file, a build must never overwrite them. Generating unconditionally would
 * silently replace live data with demo data on the next deploy.
 */

import { existsSync } from "node:fs";
import path from "node:path";

const target = path.join(process.cwd(), "data", "network.json");

if (existsSync(target)) {
  console.log("data/network.json exists — leaving it alone.");
} else {
  console.log("No data/network.json — seeding demo data for this build.");
  await import("./generate-demo.mjs");
}
