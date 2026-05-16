---
name: social-sentiment-check
description: Aggregate and classify recent social-media / news-chatter sentiment for a ticker, drug, or catalyst into a dated, source-linked sentiment memo with volume, spike detection, and explicit noise caveats. Use when the analyst asks for a sentiment check, social/Twitter/X/Reddit/StockTwits read, chatter or buzz on a name, or how the tape/retail is reacting to a catalyst — as an evidence input, never a buy/sell call.
---

# Social Sentiment Check

Turns a pile of recent social/news posts into a structured, dated read on sentiment direction, volume, and what's driving it — with every claim traceable to a specific post and explicit caveats about noise, bots, and sample size. This is an evidence aggregator. It never tells the analyst what to trade.

## When to use

- "What's the sentiment on <ticker> / <drug> right now?"
- "Any chatter / buzz on <name> after the readout?"
- "How is retail / X / Reddit / StockTwits reacting to <catalyst>?"
- Do NOT use for: predicting price, generating a trade, or as a standalone signal. It feeds the analyst's judgment; it does not replace it.

## Inputs

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| Subject | yes | `$VRTX` / "vutrisiran" | ticker, cashtag, drug, or catalyst |
| Window | no | `48h` | defaults to 48h, or since last memo |
| Post source | yes | analyst-supplied export / entitled API | see access rules |

## Data sources & access

- Use only sources the analyst is **entitled to**: a paid/authorized social API, or posts the analyst exports and supplies. Do not scrape platforms in violation of their terms or behind a login.
- If no entitled/supplied source is available: STOP and tell the analyst what access is needed. Do **not** fabricate posts or sentiment.
- Every post used keeps its permalink, author handle, and timestamp.

## Workflow

1. Collect posts for the subject in the window from the entitled/supplied source. Record total volume.
2. De-noise: drop obvious spam, giveaways, unrelated cashtag collisions, and pure price-bot reposts. Log how many were dropped and why.
3. Classify each remaining post: `bullish` / `bearish` / `neutral` / `factual-news`, plus a 0–1 confidence. Base the label only on the post text — do not infer beyond what's written. Keep the post's link/handle/timestamp on every classified record.
4. Write the classified set to `posts.csv` and run `python3 scripts/sentiment_aggregate.py posts.csv --baseline <prior-memo-volume-or-blank>` to compute the distribution, weighted tilt, volume, and spike-vs-baseline.
5. Identify the **drivers**: the 2–4 themes or specific posts moving the conversation. Quote them with links.
6. Write the dated memo (format below). State sample size and the dominant caveat prominently. No price target, no rating, no "buy/sell".

## Decision rules

- Spike flag: post volume > 3× the trailing baseline → call it out at the top (attention, not direction).
- Thin sample (< 25 usable posts): label the read **low confidence** and say so first.
- Bot/coordination smell (bursts of near-identical posts, new accounts): flag explicitly; discount those posts and note it.
- Sentiment and news conflict (e.g. bullish chatter on a negative readout): surface the divergence — don't average it away.

## Output

Write to: `sentiment-<subject-slug>-YYYY-MM-DD.md`

Gold-standard format — match exactly:

```
# Social Sentiment — $VRTX — 2026-05-16 (window: 48h)
Source: <entitled API/export> | Run by: agent (social-sentiment-check)
Collected 2026-05-16T15:00Z | 412 raw → 318 usable (94 dropped: spam/collision)

## Headline
Net tilt: mildly bearish (bear 47% / bull 31% / neutral 22%, n=318). LOW-MED confidence.
⚠ Volume spike: 3.4× trailing baseline — driven by the safety headline, not buying.

## What changed since last run
- Tilt moved bullish→bearish vs 2026-05-14 memo; volume +240%.

## Drivers
- Bearish: hepatotoxicity headline reshared widely — e.g. @handle, 2026-05-16T11:02Z [link].
- Bullish (minority): "overdone, mechanism intact" — @handle [link].

## Caveats
- ~30 near-identical bear posts from <7-day-old accounts → likely coordinated; discounted.
- 48h window only; not a price signal; corroborate against filings/clinical data.

## Sample & method
n=318 usable; labeled by text only; confidence-weighted tilt. Drop log retained.

---
Internal research support — not investment advice or a trade recommendation. Social data used under <source ToS>; sentiment is noisy and easily manipulated.
```

## Quality bar

- Every quoted post has a working link + handle + timestamp.
- Sample size and the dominant caveat appear before any conclusion.
- Coordinated/bot activity is flagged when present, never quietly averaged in.

## Hard stops

- No price target, rating, or buy/sell language.
- No fabricated or paraphrased-as-real posts; if access is missing, stop and say so.
- Never present sentiment as a standalone signal — always tag it as one noisy input requiring corroboration.
