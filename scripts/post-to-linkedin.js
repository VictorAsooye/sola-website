/**
 * post-to-linkedin.js
 *
 * Formats a LinkedIn post from a published blog article and sends it
 * to an n8n webhook, which handles the actual LinkedIn API call.
 *
 * Used as a module by generate-post.js — not meant to be run directly.
 *
 * Required env var:
 *   N8N_WEBHOOK_URL — the webhook URL from your n8n LinkedIn workflow
 */

const HASHTAGS = "#SmallBusiness #BusinessSystems #InternalPortal #AIAutomation #SolaSupport";

function formatLinkedInPost({ title, excerpt, url }) {
  // Build a hook line from the title — strip filler words, make it punchy
  const hook = titleToHook(title);

  return `${hook}

Here's what's in the full breakdown:

→ ${excerpt}

If you're running your business on email threads, group chats, and spreadsheets — this one's for you.

Read the full breakdown → ${url}

${HASHTAGS}`;
}

function titleToHook(title) {
  const lower = title.toLowerCase();

  if (lower.includes("whatsapp") || lower.includes("email") || lower.includes("spreadsheet")) {
    return "Your business shouldn't live in a group chat.";
  }
  if (lower.includes("automat") || lower.includes("workflow")) {
    return "You're doing manually what a system should be doing for you.";
  }
  if (lower.includes("onboard")) {
    return "Onboarding shouldn't take two weeks of back-and-forth.";
  }
  if (lower.includes("home health") || lower.includes("caregiver") || lower.includes("hipaa")) {
    return "Home health admin doesn't have to be this chaotic.";
  }
  if (lower.includes("cost") || lower.includes("afford") || lower.includes("price")) {
    return "The real cost isn't the software. It's the hours you lose without it.";
  }
  if (lower.includes("portal") || lower.includes("intranet")) {
    return "Your team deserves one place for everything — not seven.";
  }
  if (lower.includes("hire") || lower.includes("staff") || lower.includes("scale")) {
    return "You don't need more people. You need better systems.";
  }
  if (lower.includes("consultant") || lower.includes("IT")) {
    return "Most small businesses don't need an IT department. They need a system.";
  }

  // Fallback
  return "Running a business is hard enough. Your tools shouldn't make it harder.";
}

export async function postToLinkedIn({ title, excerpt, url }) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("   ⚠️  N8N_WEBHOOK_URL not set — skipping LinkedIn post.");
    return;
  }

  const linkedinPost = formatLinkedInPost({ title, excerpt, url });

  const payload = {
    title,
    excerpt,
    url,
    linkedinPost,
    publishedAt: new Date().toISOString(),
  };

  console.log("   Sending to n8n LinkedIn webhook…");

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`n8n webhook returned ${response.status}: ${text}`);
  }

  console.log("   ✅ LinkedIn webhook triggered.");
}
