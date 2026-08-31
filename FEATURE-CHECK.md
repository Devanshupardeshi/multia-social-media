# What we can add to the dashboard, and what we can't

Checked on 24 Aug 2026 against the live Instagram API, using the real tokens
in `config.json` (account: multiadesign). Everything below is tested, not guessed.

Short version: **out of the 6 things you asked for, 4 are fully doable, 1 is
half doable, and 1 is not possible at all.** Most of them cost us nothing extra,
because the dashboard is already downloading the data and just not showing it.

---

## 1. Business impact — link clicks and bio link taps

**Yes, we can do this.**

Instagram will tell us how many people tapped the website link in your bio, and
how many tapped the contact buttons (call, email, message, address). We tested
it: your account got 24 website taps in the last 30 days.

What we get:
- Website link taps
- Bio button taps, split by which button they tapped
- All of it for the last 7 / 14 / 30 / 90 days and all-time

What we don't get:
- A day-by-day line chart of clicks. Instagram only gives us the total for a
  period, not the daily breakdown. So it'll be a number with a comparison
  ("24 taps, up 30% from last month"), not a graph.

One note: the contact-button number is showing 0 right now. That's not a bug —
it means your profile doesn't have call/email buttons set up. Adding them in
the Instagram app will start the counter.

---

## 2. Comparisons — week by week growth and benchmarks

**Half of this already exists. The rest is easy.**

Already there: reach for the last 12 weeks.

We can add, with no extra load on the system:
- Net follower growth per week (gained minus lost) — we already download
  this daily, we just don't add it up by week
- "Up 12% vs last week" style comparisons on any number
- Views, saves and interactions per week, same as reach

**Benchmarks: this needs a reality check.** Instagram does not give anyone
industry averages. Nobody has that data through the API — the tools that claim
to have it are estimating. What we *can* give you is honest and arguably more
useful:

- Compare this week against your own last 4 weeks and your best week ever
- Compare your three accounts (multia, multiadesign, aranyaliving) side by side

So you'd get "this week is 20% above your normal" instead of "this week is
above the industry average". The first one is real.

---

## 3. SEO and keyword analytics

**No. This one isn't possible.**

I want to be straight about this rather than build something that looks like it
works. Instagram does not tell business accounts:

- What people searched to find you
- Where you rank for any keyword
- Which search terms brought traffic

That data simply isn't in the API for anyone. There's a hashtag search feature
in Meta's system, but it needs a completely different login setup, and even
then it shows you *other people's* top posts for a hashtag — not your own
ranking. It wouldn't answer your question.

**What we can build instead, which gets at the same goal:**

Every caption is already in our data. So we can analyse your own posts and show:

- Which hashtags you use correlate with the highest reach
- Which words and CTA phrases show up in your best-performing posts
- Which hashtags bring in people who *don't* already follow you

That's "which of my words are working", not "how do I rank on Instagram
search". Different question, but it's the one that actually changes what you
write next.

---

## 4. Which format brings the most reach

**Yes — and we're already downloading this data, we just never displayed it.**

The dashboard has been pulling reach and views split by format every single day
for 90 days. It's sitting in the data unused. Turning it into a chart is
frontend work only.

Your last 30 days, by views:

| Format | Views |
|---|---|
| Ads | 80,076 |
| Stories | 10,401 |
| Carousels | 7,210 |
| Reels | 5,682 |
| Single posts | 708 |

We can also split each format by "people who already follow you" vs "new
people". That's the number that actually tells you what to boost — a format
that only reaches existing followers isn't growing you, no matter how good the
views look.

---

## 5. Ads vs organic

**Mostly yes, and it doesn't need a new Instagram setup — with one limit.**

We can separate ads from organic across reach, views, likes, comments, shares
and saves. Instagram labels ad traffic separately and we're already pulling it.

**Something you should know right now:** 77% of your views in the last 30 days
came from ads. Your dashboard currently adds paid and organic together in the
big numbers at the top. So the headline figures look much stronger than your
organic performance actually is. Splitting these two apart is probably the
single most honest change we can make to the dashboard.

**What we cannot get:** money. Ad spend, cost per click, cost per result,
return on ad spend, and per-ad-creative results all live in Meta's advertising
system, which is a separate login with separate permissions. Your current
tokens are rejected by it — I tested.

So you'd get: "ads brought 54,208 new people, organic brought 2,565."
You would not get: "and it cost ₹X per person."

If the spend side matters, that's a separate setup (connecting the dashboard to
your Meta Ads account) and I can scope it as its own job.

---

## 6. When your followers are most active

**Yes, and this is the biggest new thing on the list.**

Instagram gives us how many of your followers are online, hour by hour, for the
last 28 days. I tested it on all three of your accounts and the data is there
and complete.

That means a proper grid: 7 days across, 24 hours down, showing exactly when
your audience is awake and scrolling. Right now the dashboard has a "posting
heatmap", but that's a different thing — it shows when *you* posted and how
those posts did. It doesn't tell you when your followers are actually around.

One important catch: Instagram sends these hours in its own timezone, not
Indian time. Left uncorrected, the dashboard would recommend posting at roughly
the opposite time of day. We fix that with an offset before showing anything —
just flagging it so nobody trusts the raw numbers on day one.

---

## Summary

| What you asked for | Verdict |
|---|---|
| Link clicks and bio taps | ✅ Yes |
| Week-wise growth comparison | ✅ Yes |
| Industry benchmarks | ❌ No — use your own history instead |
| SEO / keyword ranking | ❌ No — but caption analysis gets at the same goal |
| Which format brings reach | ✅ Yes — data already downloaded |
| Ads vs organic performance | ✅ Yes |
| Ad spend / cost / ROI | ❌ No — needs a separate Meta Ads connection |
| Follower active times | ✅ Yes |

**Two real dead ends:** ad spend figures, and Instagram search/SEO data.
Everything else on your list can be built.

---

## What I'd build first

Ordered by how much it tells you versus how long it takes:

1. **Follower active times** — biggest genuinely new insight, one API call
2. **Ads vs organic split** — fixes misleading headline numbers, data already here
3. **Format performance chart** — already downloaded, needs a chart only
4. **Link and bio taps** — a few lines of code
5. **Week-by-week growth** — adding up numbers we already have
6. **Caption and hashtag analysis** — the SEO substitute
7. **Ad spend** — only if you want it, needs a separate Meta Ads setup

Items 2 through 6 add no extra load to the dashboard at all. They use data
we're already paying to download.
