// GET /api/issues
// Reads open + closed issues from GitHub and returns a clean, flat list for the dashboard.
// The GitHub token stays server-side; the browser only sees parsed fields.

export default async function handler(req, res) {
  const { GITHUB_TOKEN, GITHUB_REPO } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: "Missing GITHUB_TOKEN / GITHUB_REPO." });
  }

  try {
    const all = [];
    // Paginate up to 5 pages (500 issues) — plenty for a team tool.
    for (let page = 1; page <= 5; page++) {
      const r = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/issues?state=all&per_page=100&page=${page}&sort=created&direction=desc`,
        {
          headers: {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
      if (!r.ok) {
        const d = await r.text();
        return res.status(502).json({ error: `GitHub error: ${r.status} ${d.slice(0, 200)}` });
      }
      const batch = await r.json();
      all.push(...batch);
      if (batch.length < 100) break;
    }

    const items = all
      .filter((i) => !i.pull_request) // issues only
      .map((i) => {
        const body = i.body || "";
        const type =
          (i.labels || []).map((l) => (typeof l === "string" ? l : l.name))
            .find((n) => ["bug", "task", "case"].includes((n || "").toLowerCase())) ||
          (i.title.match(/^\[(\w+)\]/)?.[1] || "issue");
        return {
          number: i.number,
          title: i.title.replace(/^\[\w+\]\s*/, ""),
          type: cap(type),
          reporter: (body.match(/\*\*Reported by:\*\*\s*(.+)/) || [])[1]?.trim() || "",
          assignee: (body.match(/\*\*Assigned to:\*\*\s*(.+)/) || [])[1]?.trim() || "",
          deadline: (body.match(/<!--\s*due:(.*?)\s*-->/) || [])[1] || null,
          state: i.state, // "open" | "closed"
          created_at: i.created_at,
          url: i.html_url,
        };
      });

    // Cache at the edge for 30s to avoid hammering the GitHub API.
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ ok: true, count: items.length, items });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Unexpected error" });
  }
}

function cap(s = "") {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
