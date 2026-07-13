// Vercel serverless function — POST /api/request-demo
//
// Receives a demo-request payload from /request-demo, writes it to Supabase,
// and sends a formatted notification email via Resend.
//
// Env vars required (set in Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL          — https://<project-ref>.supabase.co
//   SUPABASE_SERVICE_KEY  — service_role key (NOT the anon key — writes need to bypass RLS)
//   RESEND_API_KEY        — re_...
//
// Optional:
//   DEMO_NOTIFY_EMAIL     — where sales/demo team notifications land (defaults to victorasooye@gmail.com)
//   RESEND_FROM_EMAIL     — verified sender ("Sola AI Consulting <hello@solasupport.com>")

const REQUIRED_FIELDS = ['company_name', 'contact_name', 'email'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Vercel gives us `req.body` already parsed when Content-Type is application/json.
  // Fall back to manual parse just in case.
  let body = req.body;
  if (!body || typeof body === 'string') {
    try {
      body = body ? JSON.parse(body) : {};
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid JSON body' });
    }
  }

  // Basic server-side validation (never trust client-side alone)
  const missing = REQUIRED_FIELDS.filter((k) => !body[k] || String(body[k]).trim() === '');
  if (missing.length > 0) {
    return res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(', ')}` });
  }
  if (!EMAIL_RE.test(String(body.email).trim())) {
    return res.status(400).json({ ok: false, error: 'Invalid email' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ ok: false, error: 'Server not configured (Supabase env vars missing)' });
  }

  const record = {
    company_name: str(body.company_name),
    care_type: str(body.care_type) || null,
    city_state: str(body.city_state) || null,
    team_size: str(body.team_size) || null,
    contact_name: str(body.contact_name),
    contact_role: str(body.contact_role) || null,
    email: str(body.email).toLowerCase(),
    phone: str(body.phone) || null,
    pain_points: Array.isArray(body.pain_points) ? body.pain_points.slice(0, 20).map(str).filter(Boolean) : [],
    pain_details: str(body.pain_details) || null,
    example_form: str(body.example_form) || null,
    brand_color: str(body.brand_color) || null,
    brand_color_name: str(body.brand_color_name) || null,
    tagline: str(body.tagline) || null,
    timeline: str(body.timeline) || null,
    source: str(body.source) || 'solasupport.com/request-demo',
    user_agent: str(req.headers['user-agent']) || null,
  };

  // 1) Write to Supabase
  let saved;
  try {
    saved = await supabaseInsert(SUPABASE_URL, SUPABASE_SERVICE_KEY, 'demo_requests', record);
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to save request', detail: err.message });
  }

  // 2) Fire-and-log notification email. Failure here should NOT fail the request —
  //    the lead is already saved, we don't want the visitor to see an error.
  if (RESEND_API_KEY) {
    try {
      await sendNotificationEmail({
        apiKey: RESEND_API_KEY,
        to: process.env.DEMO_NOTIFY_EMAIL || 'victorasooye@gmail.com',
        from: process.env.RESEND_FROM_EMAIL || 'Sola AI Consulting <hello@solasupport.com>',
        record,
      });
    } catch (err) {
      // Log but don't fail. Vercel captures console.error into the function logs.
      console.error('[request-demo] Notification email failed:', err.message);
    }
  } else {
    console.warn('[request-demo] RESEND_API_KEY not set — skipping notification email.');
  }

  return res.status(200).json({ ok: true, id: saved && saved.id });
};

// ── Helpers ─────────────────────────────────────────────────────────────

function str(v) {
  if (v === undefined || v === null) return '';
  return String(v).slice(0, 5000).trim();
}

async function supabaseInsert(url, serviceKey, table, row) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${text || 'insert failed'}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sendNotificationEmail({ apiKey, to, from, record }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      reply_to: record.email,
      subject: `Demo request · ${record.company_name}`,
      html: renderEmailHtml(record),
      text: renderEmailText(record),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text || 'send failed'}`);
  }
  return res.json();
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br/>');
}

function row(label, value) {
  if (!value || (Array.isArray(value) && value.length === 0)) return '';
  const v = Array.isArray(value) ? value.join(', ') : value;
  return `<tr>
    <td style="padding:8px 12px; border-bottom:1px solid #E4DFD5; color:#8C8576; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; vertical-align:top; width:180px;">${esc(label)}</td>
    <td style="padding:8px 12px; border-bottom:1px solid #E4DFD5; color:#1C1A16; font-size:14px; vertical-align:top;">${esc(v)}</td>
  </tr>`;
}

function renderEmailHtml(r) {
  const swatch = r.brand_color
    ? `<span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${esc(r.brand_color)}; vertical-align:middle; margin-right:6px; border:1px solid #00000018;"></span>${esc(r.brand_color_name || '')} · ${esc(r.brand_color)}`
    : '';
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background:#FAF8F4; color:#1C1A16; padding:24px;">
  <div style="max-width:640px; margin:0 auto; background:#fff; border:1px solid #E4DFD5; border-radius:14px; overflow:hidden;">
    <div style="padding:24px 28px; border-bottom:1px solid #E4DFD5; background:#F3EFE7;">
      <div style="font-family: 'Courier New', monospace; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:#8C8576;">New demo request</div>
      <div style="font-family: Georgia, 'Times New Roman', serif; font-size:28px; letter-spacing:-0.015em; margin-top:4px;">${esc(r.company_name)}</div>
      <div style="color:#6B6557; font-size:14px; margin-top:4px;">${esc(r.contact_name)}${r.contact_role ? ' · ' + esc(r.contact_role) : ''}</div>
    </div>
    <table style="width:100%; border-collapse:collapse;">
      ${row('Care type', r.care_type)}
      ${row('Location', r.city_state)}
      ${row('Team size', r.team_size)}
      ${row('Email', r.email)}
      ${row('Phone', r.phone)}
      ${row('Timeline', r.timeline)}
      ${row('Pain points', r.pain_points)}
      ${row('Details', r.pain_details)}
      ${row('Example paperwork', r.example_form)}
      ${r.brand_color ? `<tr>
        <td style="padding:8px 12px; border-bottom:1px solid #E4DFD5; color:#8C8576; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; vertical-align:top; width:180px;">Brand color</td>
        <td style="padding:8px 12px; border-bottom:1px solid #E4DFD5; color:#1C1A16; font-size:14px; vertical-align:top;">${swatch}</td>
      </tr>` : ''}
      ${row('Tagline', r.tagline)}
      ${row('Source', r.source)}
    </table>
    <div style="padding:16px 28px; background:#FAF8F4; color:#8C8576; font-size:12px; font-family: 'Courier New', monospace;">
      Reply to this email to reach ${esc(r.email)} directly.
    </div>
  </div>
</body></html>`;
}

function renderEmailText(r) {
  const lines = [
    `New demo request from ${r.company_name}`,
    `${r.contact_name}${r.contact_role ? ' · ' + r.contact_role : ''}`,
    ``,
    `Care type:   ${r.care_type || '—'}`,
    `Location:    ${r.city_state || '—'}`,
    `Team size:   ${r.team_size || '—'}`,
    `Email:       ${r.email}`,
    `Phone:       ${r.phone || '—'}`,
    `Timeline:    ${r.timeline || '—'}`,
    ``,
    `Pain points: ${r.pain_points.length ? r.pain_points.join(', ') : '—'}`,
    `Details:     ${r.pain_details || '—'}`,
    ``,
    `Example paperwork:`,
    `  ${r.example_form || '—'}`,
    ``,
    `Brand color: ${r.brand_color ? `${r.brand_color_name} (${r.brand_color})` : '—'}`,
    `Tagline:     ${r.tagline || '—'}`,
    ``,
    `Reply to reach ${r.email} directly.`,
  ];
  return lines.join('\n');
}
