# Issue Reporter → GitHub + Telegram

A tiny web form your team uses to report bugs / tasks / cases. Each submission:

1. becomes a **GitHub issue** (so developers see it where they already work), and
2. pings your **Telegram channel** instantly.

If an issue has a deadline, a **daily reminder** posts to Telegram for anything due soon or overdue.

No framework, no build step, no database — GitHub issues *are* the store. Runs on Vercel's free plan.

---

## What you need (all free)
- A GitHub account (you have this)
- A Telegram bot + a channel
- A Vercel account (log in with GitHub)

---

## 1. Create the Telegram bot
1. In Telegram, message **@BotFather** → `/newbot` → follow prompts.
2. Copy the **bot token** it gives you → this is `TELEGRAM_BOT_TOKEN`.
3. Create your channel (or use an existing one) and **add the bot as an administrator**.

### Get the channel id (`TELEGRAM_CHAT_ID`)
- **Public channel:** the id can just be `@yourchannelname`.
- **Private channel:** post any message in the channel, then open
  `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and look for
  `"chat":{"id":-100xxxxxxxxxx}` — that `-100…` number is your id.

## 2. Create a GitHub token
1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token.
2. Give it access to the repo where issues should live.
3. Permission: **Issues → Read and write**. Copy the token → `GITHUB_TOKEN`.
4. Set `GITHUB_REPO` to `owner/repo` (e.g. `mohamed/team-issues`).

## 3. Push this project to GitHub
> ⚠️ Vercel's free plan can't connect a repo owned by a GitHub **organization**.
> Use a repo under your **personal** account (it can be private).

```bash
git init && git add . && git commit -m "issue reporter"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 4. Deploy on Vercel
1. Go to vercel.com → **Add New → Project** → import your repo.
2. Framework preset: **Other** (it's plain static + functions). Click Deploy.
3. Project → **Settings → Environment Variables** → add everything from `.env.example`
   (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GITHUB_TOKEN`, `GITHUB_REPO`,
   `CRON_SECRET`, `REMINDER_WINDOW_DAYS`).
4. **Redeploy** so the variables take effect.

Your form is now live at `https://<your-app>.vercel.app`. Open it, submit a test bug,
and check both the GitHub issues tab and your Telegram channel.

## 5. Reminders
- `vercel.json` already schedules `/api/reminders` daily at **06:00 UTC**
  (adjust the hour — it's UTC; e.g. Turkey UTC+3 → use `0 3 * * *` for 06:00 local).
- Free plan = **once per day only**. To check more often, delete the cron from
  `vercel.json` and use the included GitHub Action instead
  (`.github/workflows/reminders.yml`) — add repo secrets `APP_URL` and `CRON_SECRET`.
- Test it anytime: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<your-app>.vercel.app/api/reminders`

---

## Notes
- Vercel's free (Hobby) tier is meant for personal/non-commercial use. For an
  internal company tool at scale, Vercel expects the Pro plan — fine for a prototype.
- Want the form in Arabic / RTL? Add `dir="rtl"` to `<html>` in `index.html` and
  translate the labels — nothing else changes.
