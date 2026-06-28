# Deploying to Vercel

This app runs on Vercel as static files (`public/`) plus one serverless function
(`api/[...path].js`) that handles every `/api/*` route.

## 1. Set Environment Variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | ✅ | Your Graph API token. This is how the deployed dashboard authenticates — it is **not** editable from the admin page on Vercel (read-only filesystem). |
| `INSTAGRAM_USER_ID` | ✅ | Your Instagram professional account ID (the number under your username). |
| `ADMIN_PASSWORD` | recommended | Password for `/admin`. Defaults to `Devanshu@0609` if unset — set your own to override. |
| `GRAPH_API_VERSION` | optional | Defaults to `v23.0`. |
| `INSTAGRAM_API_MODE` | optional | `auto` (default), `instagram`, or `facebook`. |
| `SUPABASE_URL` | optional | Enables persistent storage (see below). |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Server-only key. **Never expose to the browser.** |

After changing env vars, **redeploy** for them to take effect.

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

- Dashboard: `https://your-app.vercel.app/`
- Admin (password-protected): `https://your-app.vercel.app/admin`

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
http://localhost:4173. The admin page works the same locally, and saving the token there
writes `.env`.
