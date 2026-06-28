# Instagram Content Live Dashboard

A local, zero-dependency dashboard for monitoring Instagram posts, reels, videos, images, and carousels from the Meta Graph API. It runs in demo mode until you add credentials, then streams server-side polling updates to the browser with Server-Sent Events.

## Run

```powershell
Copy-Item .env.example .env
notepad .env
node server.mjs
```

Open `http://localhost:4173`.

On Windows, you can also start it in the background with:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-dashboard.ps1
```

## Connect Instagram Graph API

Open the dashboard and use the `Connect API` panel, or set these values in `.env`:

```env
INSTAGRAM_ACCESS_TOKEN=your_long_lived_access_token
INSTAGRAM_USER_ID=your_instagram_professional_account_id
GRAPH_API_VERSION=v23.0
INSTAGRAM_API_MODE=auto
```

Use an Instagram professional account token with access to profile/media data and insights. The app keeps the token server-side and never sends it to the browser.

## Token Type Needed

If you generate the token from the Instagram setup screen, set token source to `Instagram Login` or leave it as `Auto`. For an always-on dashboard using Business Manager, use a System User token and set token source to `Facebook Login`.

Required permissions:

```text
instagram_basic
instagram_manage_insights
read_insights
```

Optional if you want the dashboard to auto-find the Instagram account ID from a Facebook Login/System User token:

```text
pages_show_list
pages_read_engagement
```

You do not need an Instagram password, client token, app access token, or short-lived Graph API Explorer token except for quick testing.

## How Live Updates Work

The browser opens `/api/live`, and the local Node server polls the Graph API on the selected refresh interval. The server pages through available media and enriches each item with insights where Meta exposes them. This gives the dashboard live updates without exposing your access token. If credentials are missing or an API call fails, the dashboard shows demo data plus connection warnings.

## Notes

- Meta changes metric names and availability over time, so the server tries both modern and legacy Reel insight metric names such as `views` and `plays`.
- Static posts and carousels may not expose every video-style metric. The dashboard keeps partial rows and uses likes/comments counts when insight metrics are unavailable.
- For production hosting, put this behind authentication and store the access token in a secret manager rather than a local `.env` file.
