// POST /api/report
// Body: { type, title, description, reporter, assignee, deadline }
// Creates a GitHub issue (our "database") and pings the Telegram channel.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    GITHUB_TOKEN,
    GITHUB_REPO,          // "owner/repo"
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_REPO || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: "Server is missing environment variables." });
  }

  // Vercel usually parses JSON, but be safe if it arrives as a string.
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const { type = "Bug", title, description = "", reporter, assignee = "", deadline = null } = body;

  if (!title || !reporter) {
    return res.status(400).json({ error: "title and reporter are required." });
  }

  // Build the issue body. The <!-- due:... --> marker is machine-readable
  // and gets picked up by the daily reminder job.
  const lines = [
    `**Type:** ${type}`,
    `**Reported by:** ${reporter}`,
  ];
  if (assignee) lines.push(`**Assigned to:** ${assignee}`);
  if (deadline) lines.push(`**Deadline:** ${new Date(deadline).toLocaleString()}`);
  lines.push("", description || "_No details provided._");
  if (deadline) lines.push("", `<!-- due:${new Date(deadline).toISOString()} -->`);

  try {
    // 1) Create the GitHub issue
    const ghRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `[${type}] ${title}`,
        body: lines.join("\n"),
        labels: [type.toLowerCase()],
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text();
      return res.status(502).json({ error: `GitHub error: ${ghRes.status} ${detail.slice(0, 200)}` });
    }
    const issue = await ghRes.json();

    // 2) Notify Telegram
    const emoji = type === "Bug" ? "🐞" : type === "Task" ? "✅" : "📋";
    const tgLines = [
      `${emoji} <b>New ${type}</b>`,
      `<b>${escapeHtml(title)}</b>`,
      `👤 By: ${escapeHtml(reporter)}`,
    ];
    if (assignee) tgLines.push(`➡️ For: ${escapeHtml(assignee)}`);
    if (deadline) tgLines.push(`⏰ Due: ${escapeHtml(new Date(deadline).toLocaleString())}`);
    if (description) tgLines.push(`\n${escapeHtml(description).slice(0, 400)}`);
    tgLines.push(`\n🔗 ${issue.html_url}`);

    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, tgLines.join("\n"));

    return res.status(200).json({ ok: true, url: issue.html_url, number: issue.number });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Unexpected error" });
  }
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) {
    const d = await r.text();
    throw new Error(`Telegram error: ${r.status} ${d.slice(0, 200)}`);
  }
}

function escapeHtml(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
