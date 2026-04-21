#!/usr/bin/env node
/**
 * generate-post.js
 *
 * Usage:
 *   node generate-post.js "SharePoint intranet for home health agency"
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY  — Claude API key
 *   GITHUB_TOKEN       — GitHub personal access token (repo scope)
 *   GITHUB_OWNER       — GitHub username (e.g. VictorAsooye)
 *   GITHUB_REPO        — Repo name (e.g. sola-website)
 *   GITHUB_BRANCH      — Branch to commit to (default: main)
 */

import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Config ───────────────────────────────────────────────────────────────────

const OWNER = process.env.GITHUB_OWNER || "VictorAsooye";
const REPO = process.env.GITHUB_REPO || "sola-website";
const BRANCH = process.env.GITHUB_BRANCH || "main";

const COVER_TONES = ["", " post-cover-accent", " post-cover-dark"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).toUpperCase();
}

function estimateReadTime(html) {
  const words = html.replace(/<[^>]+>/g, "").split(/\s+/).length;
  return Math.max(4, Math.ceil(words / 220));
}

function pickCoverTone(slug) {
  const hash = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  return COVER_TONES[hash % COVER_TONES.length];
}

// ── Claude: generate article ──────────────────────────────────────────────────

async function generateArticle(keyword) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are an expert content writer for Sola AI Consulting — a Baltimore-based consultancy that builds internal portals, SharePoint intranets, and AI automations for small businesses and home health agencies. Your writing style is direct, practical, and warm. No listicle filler. Sentences are short. You write for busy operators, not developers.`;

  const userPrompt = `Write a comprehensive, SEO-optimized blog article targeting the keyword: "${keyword}"

Return ONLY the raw HTML for the article body — no doctype, no <html>, no <head>, no <body> tags. Start directly with content elements.

Requirements:
- 800–1200 words of substantive, useful content
- Use <h2> for main section headings (3–4 sections)
- Use <h3> for subsections where appropriate
- Use <p> for body text
- Use <ul> or <ol> lists where they genuinely help clarity
- Include at least one <blockquote> with a compelling insight or real-world observation
- Include one <div class="callout"><div class="callout-label">Key takeaway</div><p>...</p></div> box with a practical tip
- Naturally weave in the target keyword and related phrases for SEO
- Link back to the homepage with: <a href="https://solasupport.com">Sola AI Consulting</a>
- Write as if you've personally implemented this for clients — specific, grounded, no vague generalities
- End the article body with a short paragraph that sets up the CTA naturally (don't write the CTA itself — it's added automatically)

Also provide at the very top (before any HTML), on separate lines:
TITLE: [the exact H1 title, compelling and keyword-rich, max 70 chars]
META: [meta description, 150–160 chars, includes keyword]
CATEGORY: [one of: Guide · Field Note · Essay · Case Study]`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = message.content[0].text.trim();

  // Parse TITLE, META, CATEGORY from top lines
  const lines = raw.split("\n");
  let title = keyword;
  let meta = `Learn about ${keyword} from Sola AI Consulting.`;
  let category = "Guide";
  let bodyStart = 0;

  for (let i = 0; i < Math.min(6, lines.length); i++) {
    if (lines[i].startsWith("TITLE:")) {
      title = lines[i].replace("TITLE:", "").trim();
      bodyStart = i + 1;
    } else if (lines[i].startsWith("META:")) {
      meta = lines[i].replace("META:", "").trim();
      bodyStart = i + 1;
    } else if (lines[i].startsWith("CATEGORY:")) {
      category = lines[i].replace("CATEGORY:", "").trim();
      bodyStart = i + 1;
    }
  }

  const body = lines.slice(bodyStart).join("\n").trim();
  return { title, meta, category, body };
}

// ── Build HTML files ──────────────────────────────────────────────────────────

function buildPostHtml({ slug, title, meta, category, body, date, readTime }) {
  const template = readFileSync(
    join(ROOT, "blog", "post-template.html"),
    "utf8"
  );
  return template
    .replace(/\{\{POST_TITLE\}\}/g, title)
    .replace(/\{\{META_DESCRIPTION\}\}/g, meta)
    .replace(/\{\{SLUG\}\}/g, slug)
    .replace(/\{\{CATEGORY\}\}/g, category)
    .replace(/\{\{READ_TIME\}\}/g, String(readTime))
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{ARTICLE_BODY\}\}/g, body);
}

function buildPostCard({ slug, title, meta, date, readTime, tone }) {
  return `      <a href="/blog/posts/${slug}.html" class="post-card">
        <div class="post-cover${tone}"><span class="cover-label">Guide</span></div>
        <div class="post-meta"><span>${date}</span><span>·</span><span>${readTime} min</span></div>
        <h2 class="post-title">${title}</h2>
        <p class="post-excerpt">${meta}</p>
      </a>`;
}

function injectCardIntoIndex(currentHtml, card) {
  const marker = "<!-- POSTS_START -->";
  const idx = currentHtml.indexOf(marker);
  if (idx === -1) throw new Error("Could not find <!-- POSTS_START --> in blog/index.html");

  // Remove the empty-state div once we have real posts
  let updated = currentHtml.replace(
    /\s*<div class="empty-state">[\s\S]*?<\/div>/,
    ""
  );

  const insertAt = idx + marker.length;
  updated = updated.slice(0, insertAt) + "\n" + card + updated.slice(insertAt);
  return updated;
}

// ── GitHub API ────────────────────────────────────────────────────────────────

async function getFileSha(octokit, path) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path,
      ref: BRANCH,
    });
    return data.sha;
  } catch {
    return undefined; // file doesn't exist yet
  }
}

async function pushFile(octokit, path, content, message, sha) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  await octokit.repos.createOrUpdateFileContents({
    owner: OWNER,
    repo: REPO,
    path,
    message,
    content: encoded,
    sha,
    branch: BRANCH,
  });
}

async function getCurrentBlogIndex(octokit) {
  const { data } = await octokit.repos.getContent({
    owner: OWNER,
    repo: REPO,
    path: "blog/index.html",
    ref: BRANCH,
  });
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const keyword = process.argv[2];
  if (!keyword) {
    console.error('Usage: node generate-post.js "your keyword here"');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  if (!process.env.GITHUB_TOKEN) throw new Error("Missing GITHUB_TOKEN");

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  console.log(`\n📝 Generating article for: "${keyword}"`);
  const { title, meta, category, body } = await generateArticle(keyword);
  console.log(`   Title: ${title}`);

  const slug = slugify(title || keyword);
  const date = formatDate(new Date());
  const readTime = estimateReadTime(body);
  const tone = pickCoverTone(slug);

  // Build files
  const postHtml = buildPostHtml({ slug, title, meta, category, body, date, readTime });
  const card = buildPostCard({ slug, title, meta, date, readTime, tone });

  // Fetch current blog index from GitHub
  console.log("   Fetching current blog/index.html from GitHub…");
  const { content: indexHtml, sha: indexSha } = await getCurrentBlogIndex(octokit);
  const updatedIndex = injectCardIntoIndex(indexHtml, card);

  // Get SHA of post file if it somehow already exists
  const postPath = `blog/posts/${slug}.html`;
  const postSha = await getFileSha(octokit, postPath);

  // Push both files
  console.log(`   Pushing ${postPath}…`);
  await pushFile(
    octokit,
    postPath,
    postHtml,
    `blog: add "${title}"`,
    postSha
  );

  console.log("   Updating blog/index.html…");
  await pushFile(
    octokit,
    "blog/index.html",
    updatedIndex,
    `blog: update index with "${title}"`,
    indexSha
  );

  console.log(`\n✅ Done! Post live at: /blog/posts/${slug}.html`);
  console.log("   Vercel will deploy in ~30 seconds.\n");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
