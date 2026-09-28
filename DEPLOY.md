# Deploying to Vercel

This app runs on Vercel as a single serverless function (`api/index.js`) that serves
both the static pages and the API — `vercel.json` routes every request to it, so it
behaves exactly like the local server. `server.mjs` is imported by that function (it is
never deployed as a function on its own).

## 1. Set Environment Variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | ✅ | Your Graph API token. This is how the deployed dashboard authenticates — it is **not** editable from the admin page on Vercel (read-only filesystem). |
| `INSTAGRAM_USER_ID` | ✅ | Your Instagram professional account ID (the number under your username). |
| `ADMIN_PASSWORD` | ✅ | The admin sign-in password. **No default** — unset means admin login is disabled. Changing it signs the admin out everywhere. |
| `ADMIN_LOGIN` | optional | The admin login ID. Defaults to `admin`. |
| `SESSION_SECRET` | ✅ | Signs session cookies. Sign-in refuses to work on Vercel without it. Keep it stable across deploys — changing it signs everyone out. |
| `TOKEN_ENCRYPTION_KEY` | recommended | Encrypts stored access tokens. 32 random bytes, base64. **Losing it means re-entering every token.** |
| `GRAPH_API_VERSION` | optional | Defaults to `v23.0`. |
| `INSTAGRAM_API_MODE` | optional | `auto` (default), `instagram`, or `facebook`. |
| `SUPABASE_URL` | ✅ in production | Persistent storage for accounts and client logins (see below). |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ in production | Server-only key. **Never expose to the browser.** |

Generate the secrets locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

(use `.toString('base64')` instead for `TOKEN_ENCRYPTION_KEY`)

After changing env vars, **redeploy** for them to take effect.

> **Rotate the old admin password.** Earlier versions shipped a hardcoded default admin
> password. It is still in this repository's git history, so treat it as public: set a new
> `ADMIN_PASSWORD` everywhere the dashboard is deployed.

## Supabase persistence (recommended for Vercel)

Without a database, serverless can't save settings from `/admin` or keep day-over-day
history. Connecting Supabase fixes both — with no extra npm dependency (it uses the REST API).

1. Create a Supabase project (free tier is fine).
2. **SQL Editor** → run [`supabase-schema.sql`](supabase-schema.sql) (creates a locked-down `kv_store` table).
3. **Project Settings → API** → copy the **Project URL** and the **`service_role`** key.
4. Add them as Vercel env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Redeploy.

With Supabase connected:
- The `/admin` page can **save the token + account** (stored in Supabase, no redeploy needed).
- **Day-over-day deltas + follower trend persist** across cold starts.
- The `service_role` key bypasses RLS and is only ever used server-side in the API function;
  the table has RLS on with no public policies, so the anon key can't touch it.

## 2. Deploy

```
npm i -g vercel      # once
vercel               # preview deploy
vercel --prod        # production
```
Or connect the Git repo in the Vercel dashboard and push.

## 3. Use

- Sign in: `https://your-app.vercel.app/login`
- Dashboard: `https://your-app.vercel.app/` (requires a sign-in)
- Admin: `https://your-app.vercel.app/admin` (admin sign-in only)

## Client logins

Each client gets their own login that sees **only the Instagram accounts you assign**.

1. Connect the client's Instagram account in `/admin` → **Add / edit account** (as before).
2. In `/admin` → **Client logins**, enter a name and login ID, press **Generate** for the
   password, tick the account(s) they may see, and **Create client**.
3. Press **Copy login details** and send them to the client. The password is shown once —
   only a hash is stored. If it's lost, use **Reset password**.

The server enforces this on every request: a client asking for any other account gets a
403, and there is no fallback to another account. **Reset password** or **Disable** signs
the client out immediately; unticking an account removes access on their next request.

Without Supabase on Vercel, client logins (like accounts) live in memory only and vanish
on the next cold start.

## Meta Ads

Connect an ad account to an Instagram account in `/admin` → **Connect an ad account**.
Every client login assigned to that Instagram account then gets an **Ads** page for that ad
account — and no other. Clients can never name an ad account themselves; the server only
reaches it through the Instagram account their login is allowed to read.

**The token needs `ads_read` and must be a Facebook token.** Instagram-login tokens (those
starting `IG`) cannot read the Marketing API. If the Instagram account is already connected
with a Facebook token that has `ads_read`, you can leave the ads token blank.

For tokens that don't expire (recommended for both Instagram and ads):

1. Create a Meta App at developers.facebook.com (type **Business**). Free, no App Review is
   needed for assets your own business manages.
2. In **Business Settings → Users → System users**, add a system user (Admin).
3. **Add assets** to it: each Page, Instagram account and ad account you manage — including
   client assets shared with your Business Manager as a partner.
4. **Generate new token** for your app with `ads_read`, `instagram_basic`,
   `instagram_manage_insights` and `pages_read_engagement`, set to never expire.

Graph API Explorer tokens are fine for a quick test but expire within hours, and user tokens
die when that person changes their Facebook password.

What the Ads page shows, per date range (with the same compare picker as the rest of the
dashboard): spend, impressions, reach, frequency, clicks, CTR, CPC, CPM; results by Meta's
own action types with cost per result; spend over time; the Facebook / Instagram /
Audience Network split with Instagram placements; and campaigns. Each range costs four
Marketing API calls however long it is, and Meta keeps 37 months of ad insights.

## Serverless trade-offs (chosen Vercel)

- **No live SSE** — the dashboard polls on the refresh interval instead.
- **Without Supabase:** the token must be set via env vars (the admin page can't persist it
  on a read-only filesystem), and day-over-day / follower history won't survive cold starts.
  **With Supabase connected (above), both are solved** — settings save from `/admin` and
  history persists.
- Each cold start re-fetches all insights, so the first load after idle is slower. The
  function `maxDuration` is set to 60s in `vercel.json`.

## Local development

`npm start` runs the full long-running server (live SSE + file persistence) on
http://localhost:4173. Put `ADMIN_PASSWORD` in `.env` to sign in; without
`SESSION_SECRET` a random one is used per run, so you are signed out on every restart.
Accounts and client logins are saved to `config.json` (gitignored).

`node server.auth.check.mjs` and `node server.range.check.mjs` run the self-checks.
