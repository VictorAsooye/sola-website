# Sola Blog Scripts

Automated SEO blog generation for Sola AI Consulting. Each week, a new article is generated via Claude and published to the live Vercel site via GitHub.

---

## Setup

### 1. Install dependencies

```bash
cd scripts
npm install
```

### 2. Set environment variables

You need two secrets. **Never commit these to git.**

#### Option A — Vercel dashboard (for automated runs)

1. Go to **vercel.com → your project → Settings → Environment Variables**
2. Add:

| Name | Value | Environment |
|------|-------|-------------|
| `ANTHROPIC_API_KEY` | Your Claude API key from console.anthropic.com | Production, Preview |
| `GITHUB_TOKEN` | Your GitHub PAT (see below) | Production, Preview |
| `GITHUB_OWNER` | `VictorAsooye` | Production, Preview |
| `GITHUB_REPO` | `sola-website` | Production, Preview |
| `GITHUB_BRANCH` | `main` | Production, Preview |

#### Option B — Local `.env` file (for manual runs)

Create `scripts/.env` — **this file is gitignored, never commit it**:

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=github_pat_...
GITHUB_OWNER=VictorAsooye
GITHUB_REPO=sola-website
GITHUB_BRANCH=main
```

Then load it before running:
```bash
export $(cat .env | xargs)
```

### 3. Create a GitHub Personal Access Token

1. Go to **github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set expiration (90 days recommended)
4. Under **Repository access**, select `sola-website` only
5. Under **Permissions**, grant:
   - **Contents** → Read and write
6. Copy the token and add it as `GITHUB_TOKEN`

---

## Triggering the first post manually

```bash
cd scripts
node generate-post.js "SharePoint intranet for home health agency"
```

This will:
1. Call Claude to write the article (~30 seconds)
2. Push `blog/posts/[slug].html` to GitHub
3. Update `blog/index.html` with the new post card
4. Vercel auto-deploys within ~30 seconds

---

## How the weekly scheduler works

```bash
cd scripts
node scheduler.js
```

- Runs on **every Monday at 08:00 UTC** using `node-cron`
- Cycles through the 10 keywords in `KEYWORDS` array in order
- Tracks position in `scheduler-state.json` (auto-created, gitignored)
- After all 10 keywords are used, it loops back to the first

To trigger the next keyword immediately **and** start the schedule:

```bash
node scheduler.js --now
```

### Keyword queue

1. SharePoint intranet for home health agency
2. internal portal for small business
3. employee portal for healthcare admin
4. Power Automate workflows for small business
5. AI automation for home health agency
6. Microsoft 365 intranet setup guide
7. how to build a staff portal without IT department
8. automated onboarding system for home health
9. SharePoint vs custom portal for small business
10. internal hub for growing business

---

## File structure

```
/blog/
  index.html            ← Blog listing page (auto-updated by generate-post.js)
  post-template.html    ← HTML template used for each generated post
  /posts/
    [slug].html         ← Generated posts land here

/scripts/
  generate-post.js      ← Main generator (takes keyword, writes post + updates index)
  scheduler.js          ← Weekly cron runner
  scheduler-state.json  ← Tracks keyword position (auto-created, gitignored)
  package.json
  README.md
```

---

## Troubleshooting

**`Missing ANTHROPIC_API_KEY`** — make sure the env var is set before running.

**`Missing GITHUB_TOKEN`** — same as above. Token needs `Contents: read/write` on the repo.

**`Could not find <!-- POSTS_START -->`** — the blog/index.html was edited and the marker comment was removed. Restore it between the `<div class="posts-grid">` and the empty-state div.

**Post generated but Vercel didn't redeploy** — check that Vercel is connected to the `main` branch and that auto-deploy is enabled in the project settings.
