#!/usr/bin/env node
/**
 * scheduler.js
 *
 * Runs generate-post.js weekly, cycling through the keyword list in order.
 * Tracks position in scheduler-state.json (created automatically).
 *
 * Usage:
 *   node scheduler.js          — start the weekly scheduler
 *   node scheduler.js --now    — run immediately with the next keyword, then schedule
 *
 * Required env vars: same as generate-post.js
 *   ANTHROPIC_API_KEY, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH
 */

import cron from "node-cron";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "scheduler-state.json");

const KEYWORDS = [
  "SharePoint intranet for home health agency",
  "internal portal for small business",
  "employee portal for healthcare admin",
  "Power Automate workflows for small business",
  "AI automation for home health agency",
  "Microsoft 365 intranet setup guide",
  "how to build a staff portal without IT department",
  "automated onboarding system for home health",
  "SharePoint vs custom portal for small business",
  "internal hub for growing business",
];

// ── State management ──────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf8"));
    } catch {
      // fall through to default
    }
  }
  return { index: 0, lastRun: null };
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

// ── Run one post ──────────────────────────────────────────────────────────────

function runNextPost() {
  const state = loadState();
  const keyword = KEYWORDS[state.index % KEYWORDS.length];

  console.log(`\n[scheduler] 🗓  ${new Date().toISOString()}`);
  console.log(`[scheduler] Keyword ${state.index + 1}/${KEYWORDS.length}: "${keyword}"`);

  try {
    execSync(`node "${join(__dirname, "generate-post.js")}" "${keyword}"`, {
      stdio: "inherit",
      env: process.env,
    });

    state.index = (state.index + 1) % KEYWORDS.length;
    state.lastRun = new Date().toISOString();
    saveState(state);

    console.log(`[scheduler] ✅ Success. Next keyword: "${KEYWORDS[state.index]}"`);
  } catch (err) {
    console.error(`[scheduler] ❌ generate-post.js failed:`, err.message);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

const runNow = process.argv.includes("--now");

if (runNow) {
  runNextPost();
}

// Every Monday at 8:00 AM UTC
const schedule = "0 8 * * 1";
console.log(`\n[scheduler] Starting — will post every Monday at 08:00 UTC`);
console.log(`[scheduler] Keyword queue: ${KEYWORDS.length} keywords (cycling)`);

const state = loadState();
console.log(`[scheduler] Next keyword: "${KEYWORDS[state.index % KEYWORDS.length]}"\n`);

cron.schedule(schedule, () => {
  runNextPost();
});
