# Multia — Full Site UI/UX Blueprint (for Stitch)

> Exhaustive definition of **every page, every graph, every component and the exact words the
> product uses** — grounded 1:1 in the real app code. Each sidebar nav item becomes its own
> separate page/bar. Stitch does the visual design; this defines *what* to build on each screen
> and *what it says*. Logo is provided separately.

**Routing model:** `/` = Accounts overview (all registered accounts). `/?account=<id>` = that
account's dashboard pages. Every app page is per-account except Accounts and Admin.

Legend for each graph spec:
**Type** · **Shows** · **X / Y axes** · **Controls** · **Interaction** · **States (exact text)**

---

## 1. Style tokens (paste into Stitch once)

**Font:** Articulat CF — Medium + Regular only. Numbers = tabular figures.
Scale: Hero 128/-5%/100% · H1 64/-4% · H2 52/-4% · H3 40/-4% · H4 32/-2%/110% ·
H5 24/-2%/110% · Sub-01 20/med/-2%/130% · Sub-02 16/med/-2%/130% · Body 16/reg/0%/130%.

**Colors:** Black `#000000` (text/headlines) · White `#FFFFFF` (bg/cards) · Red `#ED1B24`
(primary accent, CTAs, active state, live indicators — one primary red action per view) ·
Dark Grey `#4E4E4E` (secondary text/body) · Mid Grey `#B1B1B1` (borders, dividers,
placeholders, disabled, axis lines) · Light Grey `#F5F5F5` (section bg, input fill, table
zebra, skeleton).

**Chart series palette** (used everywhere below): Views = Red · Reach = Black · Interactions
= Dark Grey · 4th series/other = Mid Grey. Gender: Women = Red, Men = Black, Other = Mid Grey.
Grid lines = Light/Mid Grey. Area fills = 10% tint. Gained = Red, Lost = Black outline/grey.

**Rules:** 1px Mid Grey borders instead of shadows · 12px radius cards/inputs/buttons, 999px
pills/avatars · spacing in multiples of 8 · visible focus ring · every data view has
loading (skeleton shimmer) / empty / error / populated states.

---

## 2. Global shell (shared by every app page)

### 2.1 Sidebar (left, 240px, fixed)
Brand: logo mark + wordmark — **"Multia"** with small line **"Instagram Ops"**.
Nav items (icon + Sub-02 label), each a **separate page**:

`Overview · Analytics · Audience · Content · Operations · Live Pulse · Reports · Guide · Accounts · Admin`

Active item = Red left indicator + Red label. Footer block:
- mini label: **"Connection"**
- **connection chip** = status dot + label. Exact states:
  - connecting (amber): **"Connecting"**
  - connected (green): **"Graph API"**
  - demo (amber): **"Demo mode"**
  - error (red): **"Offline"** or **"Sync error"**
Collapses to icon-rail (tablet) / drawer (mobile).

### 2.2 Topbar (sticky, on every app page)
- **Left — account block:**
  - round avatar: profile picture, or initials fallback (**"IG"** by default)
  - eyebrow: **"Instagram professional dashboard"**
  - H4 account title: username (default before load: **"Instagram command center"**)
  - **hide-username eye toggle** next to the title — aria-label **"Hide username"** /
    **"Show username"**; when hidden the username renders as `••••••••` everywhere
    (title, report, PDF)
  - meta line: `1,882 followers - 253 items loaded - v23.0`
    (default before load: **"Loading account metrics"**)
- **Right — toolbar:**
  - back link: **"← All accounts"** (only when accounts exist)
  - **"Account"** `<select>` — options = account label or `@username` (only when ≥2 accounts);
    switching navigates to that account's dashboard
  - **"Refresh"** `<select>` — options exactly: **"30 sec" / "1 min" / "2 min" / "5 min" / "1 day"**
  - red primary button **"Sync now"** (busy state text: **"Syncing"**)
- **Warning banner** (conditional, full width under topbar, amber, aria-live): shows API
  warning strings, e.g. demo notice
  **"Demo mode is active. Use the admin page to add your token and Instagram professional
  account ID."** or per-media insight warnings from Meta.

### 2.3 Page head strip (per page)
Each page opens with: small uppercase **section label** + H2 title (exact titles per page
below) and, on Overview, the **sync meta**: live badge + last-updated.
- Live badge states: **"Connecting"** (loading) → **"Live"** (connected, red pulse) /
  **"Demo live"** (demo) / **"Reconnecting"** (error)
- Last updated: **"Not synced yet"** → **"Updated 9:14 PM"**

---

## 3. App pages (each = one nav item / separate page)

### PAGE 0 — Accounts (landing at `/`)
Section label **"Accounts"** · H2 **"All registered accounts"** · secondary button **"Refresh"**.

**C-ACCTS · Account cards grid** (responsive, min 260px cards). Each card links to that
account's Overview:
- head: avatar (photo or initials) · **@username** (bold) · small line = label or account id
- stats grid (2×2):
  - **"Followers"** — compact value + change chip **"+23 today"** (red up / grey down)
  - **"Views"** · **"Reach"** · **"Interactions"** — compact values from the account's latest
    daily snapshot ("—" when unknown)
- footer link text: **"Open dashboard →"**
- **Error card** variant (bad token): same head + red text, e.g.
  **"Invalid OAuth access token data."** — card still clickable.
- Empty state: **"No accounts registered yet. Add one from the admin page."** (link → Admin)
- Loading: skeleton cards, one per account.

---

### PAGE 1 — Overview
Section label **"Overview"** · H2 **"Live Instagram performance command center"** + sync meta.

**3.1 Summary KPI cards** — 5 equal cards. Anatomy: label (Sub-02 muted) → big compact value
(H3, tabular) → exact-value line → subline + **delta chip** → tiny delta-reference note.
Delta chip tooltip title is one of: **"Change vs {Jul 6}"** / **"Change so far today"** /
**"Change since last sync"**. Reference note: **"vs Jul 6, 9:14 PM"** / **"vs start of
today"** / **"vs last sync"**. The five cards, exact copy:

| Label | Value | Delta chip | Subline |
|---|---|---|---|
| **Views** | `19.1M` (+ exact line `19,158,398`) | `+2.1K` signed | `All-time · 253 posts` |
| **Reach** | `10.8M` | `178% v/r` (views-to-reach ratio) | `Sum of post reach · repeats counted` |
| **Interactions** | `1.2M` | `+157` signed | `379K likes` |
| **Engagement quality** | `10.8%` (exact: `1,166,150 interactions / 10,791,820 reach`, or **"Unavailable"**) | `188 reels` | `65 feed posts` |
| **Followers** | `1.8K` (exact `1,882`) | `83 following` | `184 account media` |

States: skeleton shimmer cards while loading.

**3.2 Trend explorer** (wide) — Graph G1 below.
**3.3 Selected insight** (side panel) — Component C-INSIGHT below.

---

### PAGE 2 — Analytics
Section label **"Analytics"** · H2 **"Performance graphs and posting intelligence"**.
Every panel header = eyebrow label + H5 title + small **date-span line** (e.g. `Jun 1 - Jul 13`,
set from the loaded data) + inline controls.

**G1 · Trend explorer** — eyebrow **"Trend explorer"**, title **"Daily account performance"**.
Type: grouped vertical bars, one group per day, 3 series (Views/Reach/Interactions); active
metric emphasized. Fallback variant (no account-daily data): line+area of the active metric
with small "items published" bars, legend **"{Metric}"** + **"Items published"**, axis labels
**"Publish date"** / metric name.
Shows: day-wise account totals straight from Meta insight buckets.
X = day · Y = metric value.
Controls: segmented tabs **"Views / Reach / Interactions"** + **date-range calendar** trigger
(label **"All available"**, or `Jun 14 - Jul 13`, or **"No data"**).
Interaction: click any bar/point → fills **Selected insight** with exact numbers
(insight source line: *"Graph API /insights period=day metric_type=total_value, using exact
Meta daily bucket windows. This is day-wise account activity, not publish-date grouping."*;
fallback note: *"Fallback: loaded media totals grouped by publish date because account daily
performance is unavailable."*).
States: **"Waiting for content data"** → **"No daily performance data yet"** /
(legacy) **"No metric values in this window"**.

**G2 · Account reach** — eyebrow **"Account reach"**, title **"Reach by day"**.
Type: vertical bars. Shows account reach per Meta day bucket, or per calendar month.
X = day or month · Y = reach.
Controls: segmented tabs **"Daily / Monthly"** + date-range calendar (default label
**"Last 30 days"**).
Interaction: click bar → insight.
States: **"Waiting for content data"** → **"No reach data yet"** / **"No reach in this date
range"** / **"No monthly reach data yet"**.

**G3 · Views→Saves funnel** — eyebrow **"Audience path"**, title **"Views to saves funnel"**.
Type: horizontal bar funnel. Rows exactly: **Views, Reach, Interactions, Shares, Saves**;
bar width = share of the largest (Views row small label **"base"**, others show %).
Note above bars: **"Total values from loaded media"**.
Interaction: click row → insight (metrics: value + **"Share of views"**).
Empty: **"Waiting for metrics"**.

**G4 · Saves and shares** — eyebrow **"Intent signals"**, title **"Saves and shares"**.
Type: stacked horizontal bars, top 6 posts by saves+shares. Legend: **"Saves"** / **"Shares"**.
Row = caption + split bar + total with small **"{n} saved"**.
Interaction: click → insight (Saves / Shares / **"Combined"**).
Empty: **"Saves and shares unavailable"**.

**G5 · Posting heatmap** — eyebrow **"Best time"**, title **"Posting heatmap"**.
Type: grid heatmap. Rows = **Mon Tue Wed Thu Fri Sat Sun**. Columns (label + small time):
**"Night 00-06" / "Morning 06-12" / "Afternoon 12-18" / "Evening 18-24"**.
Cell = avg views (compact) + small **"{n} items"** or **"no content"**; special cell values:
**"-"** (no content) / **"No data"** (content but views unavailable) / **"0 views"**.
Cell intensity = Red opacity scaled to avg views; distinct muted style for
no-content and views-unavailable cells.
Note: **"Average views by publish time. Counts show loaded content."**
Interaction: click cell → insight (metrics: **"Average views" / "Content" / "With view data" /
"Missing views"**).
Empty: **"Waiting for content"**.

**G7 · Views distribution** — eyebrow **"Distribution"**, title **"Views spread"**.
Type: histogram, 6 equal view-range buckets. X = view range (e.g. `0-3.2M`) · Y/bar height =
number of posts (count printed on top).
Note: **"Bar height is number of posts"**.
Interaction: click bar → insight (**"Posts"** / **"View range"**).
Empty: **"Views unavailable"**.

**G8 · Engagement mix** — eyebrow **"Engagement mix"**, title **"Where engagement comes from"**.
Type: donut. Segments exactly: **Likes / Comments / Saves / Shares**. Center = total compact
value + word **"interactions"**. Legend rows (clickable → insight): dot + label + value +
small % share. Insight metrics: segment value + **"Share of engagement"**.
Empty: **"No engagement breakdown yet"**.

**C-INSIGHT · Selected insight panel** — eyebrow **"Selected insight"**, title **"Graph
details"**. Echoes the last-clicked datapoint from ANY graph: bold title, subtitle line,
2-col metric list (label + bold value), small source line.
Default text: **"Select any point, bar or segment to see its exact numbers."**
(Two placements: side panel next to G1, full-width panel at the bottom of Analytics.
Clicked element keeps a "selected" highlight.)

**Date-range calendar popover** (used by G1, G2, G10): trigger button = current label +
▾ caret. Popover: month header with ‹ › nav (aria **"Previous month" / "Next month"**),
weekday row **Su Mo Tu We Th Fr Sa**, day grid (days with data marked, today outlined,
selected range filled), footer: selection status text —
**"Pick a start day"** → **"From Jul 1 - pick an end day"** → `Jul 1 - Jul 13` — and reset
button **"All available"**.

---

### PAGE 3 — Audience
Section label **"Audience"** · H2 **"Followers, demographics and gender split"**.

**G9 · Account performance** — eyebrow **"Account performance"**, title
**"Views, reach & reach source"**.
Control: **"Window"** select — options exactly: **"Last 7 days" / "Last 14 days" /
"Last 30 days" / "Last 90 days" / "All time"** (only windows the API returned).
Content:
- **KPI tiles** (compact + exact value): **"Views" / "Reach" / "Accounts engaged" /
  "Interactions" / "Profile views"** — or **"No windowed totals returned for this account."**
- **Reach source split bar** — head: **"Reach source"** + window label; single stacked bar
  split **"Non-followers"** vs **"Followers"**, legend rows with % + compact count.
- Footnote: **"Account-level totals straight from Instagram for the selected window — these
  react to the date range, unlike the post-sum headline cards."**
Empty: **"Waiting for account insights"** / server reason, demo reason: *"Connect your
Instagram account to see windowed account-level insights and reach source."*

**G10 · Follower growth** — eyebrow **"Follower growth"**, title **"Followers over time"** +
date-range calendar (**"All available"**).
Layout top → bottom:
- **Hero:** label **"Current followers"** · big value `1.8K` · exact line
  `1,882 total - 83 following`
- **Net chips** (up=red/down=grey/flat): **"Net latest day"** (+ date) · **"Net 7 days"**
  (small: `12 gained / 5 lost`) · **"Net range"** (+ range label)
- **Summary trio:** **"Gained"** `{n}` (+ range) · **"Lost"** `{n}` (small: **"unfollows /
  lost accounts"**) · **"Chart source"** — **"Graph API daily follower movement"** or
  **"Demo follower movement"** (small: **"Follower total line is estimated from current
  total + daily net"**)
- **Chart:** Type: combo — thin follower-total line with dots (top zone) + mirrored daily
  bars around a midline (gained up / lost down). X = date · Y = count. Legend:
  **"Estimated followers" / "Gained" / "Lost"**.
  Interaction: click bar/dot → insight (metrics: **"Estimated followers" / "Gained" /
  "Lost" / "Net change"**; titles like *"Followers gained on Jul 12"*).
- Footnote: **"Graph API provides daily new followers and aggregate follow/unfollow counts.
  It does not reveal individual users, and historical total followers are estimated from
  current followers plus daily net movement."**
Empty: **"Waiting for follower data"** / **"Follower movement chart needs daily Graph API
follower rows."**

**G11 · Gender split** — eyebrow **"By gender"**, title **"Reach & interactions by gender"**.
Control: **"Window"** select — options (only returned ones), labels exactly:
**"this week" / "last 14 days" / "last 30 days" / "last 90 days" / "this month" / "last month"**.
Content: 3 horizontal-bar blocks — **"Followers"** (small: **"lifetime"**), **"Reach"**,
**"Interactions"** (small: window label) — each split **Women / Men / Other** with colored
dot, % + compact count per row. Missing block text: **"Not returned by Instagram for this
account / API version."**
Below — views strip: **"Views (total)"** + value · **"Profile views · {window}"** + value ·
small note **"Totals only - Instagram doesn't split views or profile views by gender"**.
Footnote: **"Counts of unique accounts - no individual followers or IDs. Instagram does not
provide views broken down by gender."**
Empty: **"Waiting for audience data"** / API reason (e.g. *"Audience demographics need a
professional account with 100+ followers and a recent API version."*)

**G12 · Demographics** — eyebrow **"Demographics"**, title **"Who follows you"**.
Type: bar lists. Blocks: **"Age"** (buckets `13-17, 18-24, 25-34, 35-44, 45-54, 55-64, 65+`,
% share) · **"Top countries"** (full names, count bars) · **"Top cities"** (count bars).
Footnote: **"Aggregate follower demographics - no individual identities."**
Empty: **"Waiting for audience data"** / **"Demographics unavailable."**

---

### PAGE 4 — Content
Section label **"Content inventory"** · H2 **"All tracked posts"**.

**C-TABLE · Content inventory** —
- **Toolbar (exact controls):** search input placeholder **"Search captions"** ·
  **"Type"** select: `All / Reels / Videos / Images / Carousels` ·
  **"Signal"** select: `All / Breakout / Fast movers / Missing metrics` ·
  number input placeholder **"Min views"** ·
  **"Sort"** select: `Views / Velocity / Reach / Interactions / Engagement / Watch time /
  Score / Newest` · secondary button **"Export CSV"**.
- **Content detail strip** (aria-live, above the table). Default:
  **"Select a reel or post to inspect exact content metrics."** Selected state:
  type pill + bold caption + small line `2 days ago - Breakout - breakout candidate` ·
  right side: score pill **"{n} score"** + secondary button **"Open"** (permalink).
  Metric grid (compact + exact + source note where present): **Views · Reach · Likes ·
  Comments · Shares · Saves · Interactions · Engagement · Views / hour** (note: **"Derived
  locally from publish time"**) · **Velocity** (note: **"Change since previous sync"**).
  Unavailable metrics render dimmed with "—".
- **Table columns (all sortable, exact headers):**
  `Content · Type · Views · Velocity · Reach · Interactions · Engagement · Watch time · Score · Posted`
  - Content cell = thumbnail (or type word) + caption + small signal line + link
    **"Open on Instagram"**
  - Velocity cell = green `+{compact}` with exact stack
  - Score cell = score pill; score labels: **Breakout ≥80 · Strong ≥60 · Steady ≥40 · Watch <40**
  - Posted = relative (**"Today" / "Yesterday" / "{n} days ago" / "Jun 27"**)
  - signal line variants: **"{Score label} - breakout candidate"** / **"- fast mover"** /
    **"- metrics missing"** / **"Tracked"**
  - Zebra rows, sticky header, sort arrows, hover + selected highlight. Row click → detail strip.
- **Mobile:** table hidden; stacked **card list** — thumbnail+caption block + stat grid with
  labels `Type / Views / Velocity / Reach / Engagement / Watch time / Score`.
- States: loading **"Loading content"** · empty **"No content matches this view"**.

---

### PAGE 5 — Operations
Section label **"Operations"** · H2 **"Accuracy, movement, and reporting controls"**.

**C-TOP · Leaderboard** — eyebrow **"Leaderboard"**, title **"Top content by views"**.
Ranked list (top 5): `1. {caption}` + views value; sub-line exactly:
`{Type} - {reach} reach - {x%} engagement - {n} score`.
Empty: **"Top content will appear here"**.

**C-SNAP · Followers panel** — eyebrow **"Followers"**, title **"Audience snapshot"**.
Hero: **"Current followers"** + compact value + small **"{exact} exact followers"**.
Metric list (label / value / small detail):
**"Following"** (detail: **"Current follows count"**) · **"Account media"** (detail:
**"Instagram account media count"**) · **"Views / follower"** · **"Reach / follower"** ·
**"Interactions / follower"** (details show the exact division, e.g.
`19,158,398 views / 1,882 followers`).
Footnote: **"Per-follower ratios from the current snapshot. See the Audience page for
follower growth over time."**
Empty: **"Follower metrics will appear here"**.

**C-ACC · Accuracy center** — eyebrow **"Accuracy center"**, title **"Data quality status"**.
Status rows (label + bold value): **"Source"** (`Instagram Graph API` / `Demo data`) ·
**"API host"** (`graph.instagram.com` / `graph.facebook.com` / `local demo`) ·
**"Loaded media"** (`253 / 184 account count`) · **"Page status"** (**"All returned pages
loaded"** or **"More media may be available beyond the local limit"**).
Coverage list — one row per metric **Views / Reach / Interactions / Shares / Saves**:
small line **"{n} available, {n} unavailable"** + bold coverage %.
Empty: **"Waiting for diagnostics"**.

**C-CMP · Compare board** — eyebrow **"Compare mode"**, title **"Content type comparison"**.
One card per content type: type pill (`Reels/Videos/Images/Carousels`) + bold
**"{n} items"**; definition list: **"Avg views" / "Avg reach" / "Engagement"**.
Empty: **"Content types will appear here"**.

**C-MIX · Inventory mix** — eyebrow **"Inventory mix"**, title **"Tracked media types"**.
Simple rows: **"Reels" / "Videos" / "Images" / "Carousels" / "Other posts"** + counts
(only non-zero rows).
Empty: **"Content mix will appear here"**.

---

### PAGE 6 — Live Pulse
Section label **"Live pulse"** · H2 **"Recent movement"**. (Give this page the "energetic,
real-time" treatment — it's the heartbeat of the product.)

**C-FEED · Activity feed** — up to 8 items, newest movement since last sync. Item anatomy:
bold caption + red `+{Δviews}` value; sub-line exactly:
`{Type} - {n} new interactions - {9:14 PM}`.
Auto-updates on every sync (per the Refresh interval).
Empty: **"No movement yet"**.

---

### PAGE 7 — Reports
Section label **"Report"** · H2 **"Creator summary"**.
Header actions: secondary buttons **"Export PDF"** and **"Copy"** (Copy feedback:
**"Copied"**, failure: **"Select text"**).

**C-REPORT · Report text box** (monospace-ish block, exact generated template):

```
Instagram Reels report for @username
Date range: Jun 1 - Jul 13  ·  Generated: 7/14/2026, 9:14 PM
Followers: 1,882  ·  Posts tracked: 253 (~4.2/week)

Views: 19.1M (19,158,398)  ·  +2.1K vs Jul 6
Reach: 10.8M (10,791,820)
Interactions: 1.2M (1,166,150)
Engagement rate: 10.8%

Engagement mix: Likes 74% · Comments 8% · Saves 11% · Shares 7%
Signal: Likes drive 74% of engagement.

Top performers:
  1. "Caption…" - 3.2M views | 12.4% eng | score 86
  2. …
  3. …

Fastest mover: "Caption…" +12K views since last sync.
Best posting window: Friday 18:00-24:00 - 1.2M avg views (14 posts).
Top format: Reels - 98K avg views across 188 posts.
```

Empty: **"Report will appear after sync"**.

**PDF export** (A4 print doc, branded): header = logo mark + H1 **"Reels Performance
Report"** + sub `@username · {range}`; right block `{n} followers` + **"Generated {date}
{time}"**. Sections: KPI card row (**Views / Reach / Interactions / Engagement rate**) →
**"Engagement mix"** (stacked bar + legend) → **"Highlights"** (bullets: dominant signal,
best posting window, fastest mover, top format, cadence `253 posts over 42 days
(~4.2/week)`) → **"Top performers"** table (`# / Content / Views / Reach / Eng. / Score`).
Footer: **"Generated by Multia · Instagram Ops"** + **"Data range {range}"**.

---

### PAGE 8 — Guide
Section label **"Tracking guide"** · H2 **"Full Instagram tracking setup"**.
4 numbered cards (H3 + Body), exact copy:

1. **"1. Connect correctly"** — "Use Instagram Login for tokens generated from the Instagram
   setup page. Paste the Instagram account ID shown under the username, then Save and test."
2. **"2. Track everything"** — "The server pages through the media API and loads every
   available post until Meta stops returning more pages or the local safety limit is reached."
3. **"3. Read the metrics"** — "Views use views, plays, or impressions when Meta exposes
   them. Reach, saves, shares, comments, likes, and total interactions are loaded when
   available for that media type."
4. **"4. Operate weekly"** — "Sort by velocity during launch windows, sort by engagement for
   creative review, filter by type to compare reels against feed posts, then export CSV for
   reporting."

---

### PAGE 9 — Admin (password-gated, not per-account)

**Lock view:** centered card — eyebrow **"Restricted"** · H5 **"Admin access"** · field label
**"Password"**, placeholder **"Enter admin password"** · red button **"Unlock"** · error
feedback **"Incorrect password"**.

**Settings view (after unlock):** page head — eyebrow **"Admin"** + H2 **"Graph API
settings"** + link **"← Back to dashboard"**. Three stacked panels:

- **C-STATUS · Current connection** — eyebrow **"Status"**, title **"Current connection"**,
  state chip: **"Checking…"** → **"{n} accounts configured"** / **"Not connected"**.
  Status row (label + bold value): **"Mode"** (`Graph API` / `Demo`) · **"Accounts"** (count) ·
  **"Default account"** (`@username`) · **"API version"** (`v23.0`) · **"Host"**
  (`graph.instagram.com`). Failure: **"Status — Unavailable"**.

- **C-ACCADMIN · Registered accounts** — eyebrow **"Accounts"**, title **"Registered
  accounts"**. Row per account: avatar · bold `@username` + **"Default"** badge (pill) ·
  small line `{label} · {account id}` · actions: **"Edit" / "Make default" / "Delete"**
  (Make default hidden on the default row). Delete uses a confirm:
  **"Remove @{username} from the dashboard? Its saved token is deleted."**
  Empty: **"No accounts yet. Add the first one below — the dashboard runs in demo mode
  until then."**

- **C-CONNECT · Add / edit account** — eyebrow **"Connection"**, title **"Add / edit
  account"**. Form fields (label + placeholder):
  - **"Access token"** (password input) — **"Paste token to add or replace an account"**;
    when editing: **"Stored token kept — paste to replace"**
  - **"Instagram account ID"** — **"1784…"**
  - **"Label (optional)"** — **"e.g. Brand main"**
  - **"Graph API version"** — **"v23.0"**
  - **"Token source"** select: **"Auto" / "Instagram Login" / "Facebook Login"**
  - Buttons: red **"Save and test"** (busy: **"Testing"**) · secondary **"Find account"**
    (busy: **"Finding"**)
  - Side guide, two blocks: **"Token type"** — "From the Instagram setup screen, use
    Instagram Login. For Business Manager / System User tokens, use Facebook Login." ·
    **"Needed permissions"** — "Minimum: instagram_basic, instagram_manage_insights,
    read_insights. The account ID is the number shown under your Instagram username."
  - Feedback strings: **"Testing Graph API access…"** → **"Connected @{username} — it now
    appears on the dashboard overview."** · edit hint **"Editing @{username}. Save and test
    applies the changes."** · discover: **"Looking for connected Instagram professional
    accounts…"** → **"Choose an account below, then Save and test."** · persist warning:
    **"Applied for now, but it could not be saved permanently. Connect Supabase
    (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) to persist accounts across restarts/deploys."**
  - Discovered account option row: bold `@username` + small `{account id} · {page name}`.

---

## 4. Marketing + auth pages (Stitch invents visuals; inventory only)

**M1 Landing** — navbar · hero (Hero-size headline + red "Start free" + ghost "See it live" +
live "synced 12s ago" chip + dashboard screenshot) · social-proof stat strip · 3 alternating
feature rows · bento grid of 6 capabilities · "How it works" 3 steps · Black stat band ·
testimonial · pricing preview · final CTA band · footer.
**M2 Features** — hero + one section per real module (mirrors Pages 1–8) with screenshots.
**M3 Pricing** — Monthly/Yearly toggle · 3 plan cards (Free / Pro "Most popular" / Agency) ·
comparison table · FAQ accordion · CTA band.
**M4 About** · **M5 Contact/Demo** (split + form) · **M6 Legal** (privacy/terms long-form).
**A1 Login** · **A2 Sign up** · **A3 Forgot password** · **A4 Connect Instagram wizard**
(3-step stepper reusing C-CONNECT). **E1 404 / E2 500** error pages.

---

## 5. Component library (build once, reuse)

- **Buttons:** Primary (Red), Secondary (bordered), Ghost, Small — default/hover/active/
  focus/disabled/loading (loading swaps label: "Syncing", "Testing", "Finding").
- **Form controls:** text, password, number, search, `<select>`, textarea, checkbox, toggle —
  label above, Light Grey fill, Red focus ring, Red error border + message.
- **Segmented control / tabs** — active = Black or Red fill (used: Views/Reach/Interactions,
  Daily/Monthly).
- **Chips/badges:** connection chip (dot+label) · delta chip (signed, up/down/flat — never
  color-only) · "Live" pulse badge · score pill (Breakout/Strong/Steady/Watch) · type pill
  (Reel/Video/Image/Carousel) · **"Default"** badge · "Most popular" ribbon.
- **Cards:** KPI card · panel (header+controls+body+states) · account card · guide card ·
  compare card · plan card · testimonial card.
- **Panel header** — eyebrow (uppercase small) + H5 title + date-span line + inline controls.
- **Selected-insight panel** — title + subtitle + metric grid + source line.
- **Date-range calendar popover** — spec in Page 2.
- **Table** — sortable headers, zebra, sticky header, row hover/selected, mobile card
  fallback, CSV export.
- **Chart primitives** — grouped bar, vertical bar, line+area, stacked horizontal bar,
  funnel bar, donut, histogram, heatmap grid, mirrored gain/loss bars + total line,
  sparkline — all with tooltip, click-to-inspect (feeds Selected insight), and
  empty/loading/error states. Series colors per §1.
- **Feedback** — toast, inline aria-live status line, banner/notice (info/warn/error),
  confirm dialog, tooltip, skeleton shimmer, spinner, empty-state (line + optional action).
- **Navigation** — marketing navbar (+ drawer), app sidebar (+ rail), footer, back link,
  stepper, connection chip, avatar (+ initials fallback).

---

## 6. Global states & responsive

- **Breakpoints:** ≥1440 wide app · 1024–1439 desktop · 768–1023 tablet (sidebar→rail,
  grids 2-col) · <768 mobile (sidebar→drawer, content table→cards, first KPI card spans
  full width and enlarges).
- **Every data component:** loading (skeleton) / empty / error (retry) / populated.
- **Demo mode** (no account connected): full dashboard renders with demo data + amber banner
  (exact text in §2.2), chip **"Demo mode"**, badge **"Demo live"**; Account performance and
  gender/demographics show connect prompts instead of fake data.
- **Privacy:** hide-username toggle masks `@username` as `••••••••` in topbar, report, PDF.
- **Reduced motion:** kill shimmer/pulse/transitions. **Dark mode:** phase 2.

---

## 7. Words we use (exact vocabulary — keep consistent everywhere)

| Word | Meaning in-product |
|---|---|
| **Views** | views / plays / impressions — whichever Meta returns |
| **Reach** | unique accounts reached (post-sum notes "repeats counted") |
| **Interactions** | likes + comments + saves + shares (Meta total) |
| **Engagement / Engagement quality / Engagement rate** | interactions ÷ reach, shown as % |
| **Velocity** | `+{n}` views gained since the previous sync |
| **Score** | local 0–100 content score; labels **Breakout ≥80, Strong ≥60, Steady ≥40, Watch <40** |
| **Signals** | row tags: `Breakout / Fast movers / Missing metrics` |
| **Watch time** | avg reel watch time (reels only) |
| **Accounts engaged** | unique accounts that engaged (account-level window metric) |
| **Profile views** | account profile views in the window |
| **Reach source** | reach split **Followers vs Non-followers** |
| **Net / Gained / Lost** | daily follower movement; net = gained − lost |
| **Sync** | one data refresh from the Graph API ("Sync now", "since last sync") |
| **Demo mode** | no token connected; sample data shown |
| **Unavailable / "—"** | Meta did not return that metric for this media/token |

Standard number formats: compact (`19.1M`, `1.2K`) for headlines with exact
(`19,158,398`) beneath; percents 1 decimal max; signed deltas always `+`/`−`;
dates `Jun 27`; times `9:14 PM`; ranges `Jun 1 - Jul 13`.

---

*IA mirrors the real app modules exactly, split so each nav item is its own page. Rebrand the
current olive/system-font dashboard to Articulat CF + Red/Black/Grey without changing what
each graph plots or what any label says.*
