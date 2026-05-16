---
name: pubmed-literature-review
description: Pull and triage new PubMed publications for a drug, target, indication, or company watchlist, and produce a dated, fully-cited literature memo with what changed since the last run. Use when the analyst asks to check the literature, run a lit review, monitor publications/abstracts, or track new papers/data for a drug, target, mechanism, or competitor in biotech/pharma.
---

# PubMed Literature Review

Monitors the peer-reviewed literature for an analyst's watchlist (drugs, targets, indications, companies) and produces a dated, cited memo highlighting what is new and why it matters for the thesis. Built on the public NCBI E-utilities API — no credentials required.

## When to use

- "Check PubMed / the literature for <drug/target/indication>"
- "Any new papers on <X> since last week?"
- "Run the lit review for the watchlist"
- Do NOT use for: full systematic reviews / meta-analyses (that's a manual analyst task), or non-PubMed sources (preprints, conference abstracts) unless the analyst asks to extend it.

## Inputs

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| Query terms | yes | `vutrisiran amyloidosis` | drug, target, NCT id, or company |
| Lookback window | no | `30 days` | defaults to 30 days, or since last run if a prior memo exists |
| Watchlist file | no | `watchlist.txt` | one query per line for batch runs |

## Data sources & access

- **NCBI E-utilities** (`esearch` + `efetch`) — public, no key needed. Respect the documented rate limit (≤3 requests/sec without an API key). Handled by `scripts/pubmed_search.py`.
- If NCBI is unreachable: retry with backoff, then write a partial memo stating the failure and coverage gap. Never fill gaps from memory.

## Workflow

1. Resolve inputs. If a prior memo exists for the same query (`pubmed-<query>-*.md`), set the lookback to "since that memo's run date" and note it.
2. Run `python3 scripts/pubmed_search.py "<query>" --days <N>` to get the candidate PMIDs with title, journal, authors, date, abstract, and DOI. The script only returns what NCBI returns — it never synthesizes.
3. Triage each result against the **relevance rules** below. Discard off-topic hits; keep and rank the rest.
4. For each kept paper, write a 1–3 sentence "why it matters for the thesis" note grounded **only** in the abstract text. If the abstract doesn't support a claim, say so — do not infer trial results that aren't stated.
5. Build the "What changed since last run" section by diffing PMIDs against the previous memo.
6. Write the dated memo (format below). Do not editorialize a rating or price impact — surface the evidence; the analyst draws the conclusion.

## Relevance rules

- **Keep:** clinical results, trial designs, mechanism/biomarker data, safety signals, competitive readouts, anything naming the drug/target/indication directly.
- **Rank higher:** randomized/controlled clinical data > early clinical > preclinical > review/commentary.
- **Discard:** unrelated indication, unrelated molecule with a similar name, pure methods papers with no bearing on the thesis.
- **Escalate (flag at top):** new safety signal, failed endpoint, or a result that contradicts the current thesis.

## Output

Write to: `pubmed-<query-slug>-YYYY-MM-DD.md` in the analyst's research directory.

Gold-standard format — match exactly:

```
# PubMed Literature Review — <query> — 2026-05-16
Lookback: since 2026-04-18 (prior memo) | Run by: agent (pubmed-literature-review)
NCBI E-utilities queried 2026-05-16T14:02Z | 7 hits, 4 kept

## ⚠ Flags
- New grade 3 hepatotoxicity signal reported in Phase 2 — see [3].  (confidence: med — single study, n=42)

## What changed since last run
- New: [1], [2], [3]
- No longer surfaced (outside window): 2 prior papers

## Kept papers
1. <Title>. <Journal>, 2026. Authors: <et al>. PMID 40123456, DOI 10.xxxx.
   Why it matters: <1–3 sentences grounded in the abstract>.  (confidence: high)
   [source: https://pubmed.ncbi.nlm.nih.gov/40123456/ , retrieved 2026-05-16T14:02Z]
...

## Could not verify / gaps
- Abstract unavailable for PMID 40123999 — title-only; flagged for analyst.

---
Internal research support — not investment advice. Data from NCBI E-utilities, public domain; PubMed/MEDLINE terms apply.
```

## Quality bar

- Every paper carries PMID + link + retrieval timestamp. No paper without a source line.
- "Why it matters" never asserts a result the abstract doesn't state.
- Flags section is never silently empty when a safety/efficacy signal exists in the kept set.

## Hard stops

- Do not assert a stock/rating/price impact.
- Do not claim trial outcomes not present in the retrieved abstract.
- Do not drop coverage silently on API failure — document the gap.
