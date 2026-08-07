#!/usr/bin/env node
/**
 * Builds the static site and publishes it to the `gh-pages` branch.
 *
 *   npm run deploy:pages
 *
 * Uses a detached worktree rather than switching branches, so an in-progress
 * edit on main is never disturbed and nothing can be committed to the wrong
 * branch by accident. The branch is orphaned and force-updated each time —
 * it's build output, not history worth keeping.
 *
 * BASE_PATH must match the repository name: Pages serves a project site under
 * /<repo>/, and without the prefix every asset 404s and the page renders bare.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BRANCH = "gh-pages";
const basePath = process.env.BASE_PATH ?? "";

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { encoding: "utf8" }).trim();

if (!basePath) {
  console.error(
    "BASE_PATH is empty. Pages serves project sites under /<repo>/, so the " +
      "build needs it or every asset will 404. Run: BASE_PATH=/<repo> npm run deploy:pages",
  );
  process.exit(1);
}

console.log(`Building with BASE_PATH=${basePath} ...`);
run("npm", ["run", "build"], { env: { ...process.env, BASE_PATH: basePath } });

const out = path.join(process.cwd(), "out");
if (!readdirSync(out).length) {
  console.error("out/ is empty — the build produced nothing.");
  process.exit(1);
}

// Jekyll silently drops any directory starting with an underscore, which is
// exactly where Next puts every asset (_next/). Without this the page loads
// with no CSS and no JavaScript.
writeFileSync(path.join(out, ".nojekyll"), "");

const worktree = mkdtempSync(path.join(tmpdir(), "pyrotree-pages-"));
try {
  run("git", ["worktree", "add", "--detach", worktree]);

  // Start from an empty tree so deleted files actually disappear from the
  // branch. The orphan branch gets a throwaway name: reusing BRANCH fails on
  // every run after the first, because the local branch already exists. Only
  // the push refspec below decides what lands on the remote.
  const temp = `pages-publish-${process.pid}`;
  run("git", ["-C", worktree, "checkout", "--orphan", temp]);
  run("git", ["-C", worktree, "reset", "--hard"]);

  cpSync(out, worktree, { recursive: true });

  run("git", ["-C", worktree, "add", "-A"]);
  const sha = capture("git", ["rev-parse", "--short", "HEAD"]);
  run("git", [
    "-C",
    worktree,
    "commit",
    "-q",
    "-m",
    `Publish static site from ${sha}`,
  ]);
  run("git", ["-C", worktree, "push", "-f", "origin", `HEAD:${BRANCH}`]);

  console.log(`\nPublished ${BRANCH} from ${sha}.`);
} finally {
  run("git", ["worktree", "remove", "--force", worktree]);
  rmSync(worktree, { recursive: true, force: true });
}
