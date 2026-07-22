// GET /api/reminders
// Runs on a schedule. Scans open issues for a <!-- due:ISO --> marker and sends
// a Telegram digest of anything due within REMINDER_WINDOW_DAYS or already overdue.
// Protected by CRON_SECRET (Vercel Cron sends it automatically; GitHub Actions passes it).

export default async function handler(req, res) {
  const {
    GITHUB_TOKEN,
    GITHUB_REPO,
    TELEGRAM_BOT_TOKEN,
    TELEGRAM_CHAT_ID,
    CRON_SECRET,
    REMINDER_WINDOW_DAYS = "2",
  } = process.env;

  // Auth: allow if no secret set, else require matching Bearer token.
  if (CRON_SECRET) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  if (!GITHUB_TOKEN || !GITHUB_REPO || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: "Missing environment variables." });
  }

  const windowMs = Number(REMINDER_WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );
    if (!ghRes.ok) {
      const d = await ghRes.text();
      return res.status(502).json({ error: `GitHub error: ${ghRes.status} ${d.slice(0, 200)}` });
    }
    const issues = await ghRes.json();

    const due = [];
    for (const issue of issues) {
      if (issue.pull_request) continue; // skip PRs
      const m = (issue.body || "").match(/<!--\s*due:(.*?)\s*-->/);
      if (!m) continue;
      const dueDate = new Date(m[1]);
      if (isNaN(dueDate)) continue;
      const diff = dueDate.getTime() - now;
      if (diff <= windowMs) {
        due.push({ issue, dueDate, overdue: diff < 0 });
      }
    }

    if (due.length === 0) {
      return res.status(200).json({ ok: true, reminders: 0 });
    }

    due.sort((a, b) => a.dueDate - b.dueDate);
    const lines = ["⏰ <b>Deadline reminders</b>", ""];
    for (const { issue, dueDate, overdue } of due) {
      const when = dueDate.toLocaleString();
      const tag = overdue ? "🔴 OVERDUE" : "🟡 Due soon";
      lines.push(`${tag} — <b>${escapeHtml(issue.title)}</b>`);
      lines.push(`   ${when}  ·  ${issue.html_url}`);
    }

    await sendTelegram(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, lines.join("\n"));
    return res.status(200).json({ ok: true, reminders: due.length });
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
  if (!r.ok) throw new Error(`Telegram error: ${r.status}`);
}

function escapeHtml(s = "") {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
