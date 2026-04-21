/**
 * post-to-linkedin.js
 *
 * Sends a formatted LinkedIn post to Buffer, which publishes it to
 * the Sola Support LinkedIn company page.
 *
 * Required env vars:
 *   BUFFER_ACCESS_TOKEN  — from buffer.com/developers/apps
 *   BUFFER_PROFILE_ID    — LinkedIn profile ID from Buffer API
 */

const HASHTAGS = "#SmallBusiness #BusinessSystems #InternalPortal #AIAutomation #SolaSupport";

function formatLinkedInPost({ title, excerpt, url }) {
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
  if (lower.includes("consultant") || lower.includes("it ")) {
    return "Most small businesses don't need an IT department. They need a system.";
  }

  return "Running a business is hard enough. Your tools shouldn't make it harder.";
}

export async function postToLinkedIn({ title, excerpt, url }) {
  const accessToken = process.env.BUFFER_ACCESS_TOKEN;
  const profileId = process.env.BUFFER_PROFILE_ID;

  if (!accessToken || !profileId) {
    console.warn("   ⚠️  BUFFER_ACCESS_TOKEN or BUFFER_PROFILE_ID not set — skipping LinkedIn post.");
    return;
  }

  const text = formatLinkedInPost({ title, excerpt, url });

  const body = new URLSearchParams({
    access_token: accessToken,
    text,
    "profile_ids[]": profileId,
    shorten: "false",
    now: "true",
  });

  console.log("   Sending to Buffer → LinkedIn…");

  const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error || `Buffer returned ${response.status}`);
  }

  console.log("   ✅ LinkedIn post queued in Buffer.");
}
