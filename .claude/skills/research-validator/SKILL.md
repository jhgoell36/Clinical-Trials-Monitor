---
name: research-validator
description: Audit an analyst artifact (memo, model change log, sentiment report, thesis note, any document with claims) for correctness — extract every claim, number, and citation, verify each against its cited source, and flag anything unsourced, mismatched, overstated, stale, internally inconsistent, or arithmetically wrong. Use when the analyst says validate / fact-check / sanity-check / verify the numbers/sources / audit this memo before it goes out, or as the QA gate on output from the other analyst skills.
---

# Research Validator

A verification agent. It does not write research — it checks research. Given an artifact, it extracts every material claim, number, quote, and citation, confirms each against its source, and produces a per-item verdict plus an overall pass/fail. It is deliberately adversarial: its job is to find what is wrong or unsupported before the analyst's name is on it.

## When to use

- "Validate / fact-check / audit this memo before it goes out"
- "Sanity-check the numbers in <file>"
- "Do the sources actually say this?"
- As the QA gate on output from `pubmed-literature-review`, `financial-model-update`, `social-sentiment-check`, or any analyst document.
- Do NOT use to *generate* content or to silently rewrite the artifact — it reports; the analyst decides.

## Inputs

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| Artifact path | yes | `pubmed-vrtx-2026-05-16.md` | the document to audit |
| As-of date | no | `2026-05-16` | for staleness checks; defaults to today |
| Max source age | no | `90d` | flag sources older than this |
| Source access | no | WebFetch / supplied docs | how the validator may re-check citations |

## The cardinal rule

**The validator must never fabricate a verification.** If it cannot actually read the cited source (paywall, no network, broken link, source not provided), the item is `UNVERIFIABLE` — never `VERIFIED`. Assuming a source says something you did not read is the exact failure this skill exists to catch; do not commit it yourself.

## Workflow

Create a todo list and work through it.

1. **Deterministic pre-check.** Run `python3 scripts/precheck.py <artifact> --asof <date> --max-age-days <N>`. This flags, mechanically: claim lines with no `[source: …]`, missing/old retrieval timestamps, failed arithmetic, the same metric stated with two different numbers, and malformed/unreachable URLs. Treat its output as the seed list, not the whole job.

2. **Extract every checkable item.** Walk the artifact and list each: factual claim, number/figure, direct quote, trial ID / accession / filing reference, date, and the citation attached to it. A material claim with no citation is itself a finding (`UNSOURCED`).

3. **Verify each item against its cited source.** For each, retrieve the source the artifact points to (WebFetch / analyst-supplied doc). Then check:
   - **Existence** — does the source resolve and is it the thing cited?
   - **Support** — does the source actually state the claim, or only something weaker/adjacent?
   - **Exactness** — do numbers, units, currency, period, dates, quotes, and IDs match the source *exactly* (not rounded, not paraphrased as fact)?
   - **Overreach** — does the artifact assert a conclusion (causation, outcome, guidance) the source does not support?
   - **Currency** — is the source current as of the as-of date, or superseded/stale?

4. **Cross-check internal consistency.** Same metric must carry the same value everywhere. Totals must equal their parts. A "% change" must match the raw figures. Narrative must not contradict the tables.

5. **Assign a verdict per item** (taxonomy below) with a one-line reason and the evidence (source locator + what it actually says).

6. **Roll up an overall verdict** and write the dated report (format below). Do not edit the original artifact. Corrections, if obvious, go in a clearly-labeled "Proposed corrections" section for the analyst to apply — never applied silently.

## Verdict taxonomy

| Verdict | Meaning |
|---|---|
| `VERIFIED` | Source read; states the claim; numbers/quotes match exactly. |
| `QUESTIONABLE` | Source loosely supports it, is weak/secondary, number rounded/derived without showing work, claim overstates the source, or data is stale. Surfaced for analyst judgment. |
| `INCORRECT` | Contradicts the cited source, number/quote/ID mismatch, or arithmetic is wrong. |
| `UNSOURCED` | Material claim with no citation at all. |
| `UNVERIFIABLE` | Source could not be read (paywall, dead link, no network, not provided). Explicitly NOT a pass. |

**Overall:** `FAIL` if any `INCORRECT` or any `UNSOURCED` material claim. `PASS-WITH-FLAGS` if only `QUESTIONABLE`/`UNVERIFIABLE` remain. `PASS` only if every material item is `VERIFIED`.

## Flagging rules

- A number that differs from its source in any digit, unit, or period → `INCORRECT` (not "close enough").
- "Study shows X causes Y" when the source says "associated with" → `QUESTIONABLE` (overreach), called out explicitly.
- Citation present but link dead / source not actually re-read → `UNVERIFIABLE`, never `VERIFIED`.
- Same metric with two values in the same doc → `INCORRECT` internal inconsistency; show both locations.
- Stale source (older than max age, or superseded by a later filing/readout) → `QUESTIONABLE` with the staleness noted.
- Quote not verbatim → `INCORRECT` if it changes meaning, else `QUESTIONABLE`.

## Output

Write to: `validation-<artifact-slug>-YYYY-MM-DD.md`

Gold-standard format — match exactly:

```
# Validation Report — pubmed-vrtx-2026-05-16.md — 2026-05-16
As-of: 2026-05-16 | Max source age: 90d | Run by: agent (research-validator)
Items checked: 24 | VERIFIED 18 · QUESTIONABLE 3 · INCORRECT 2 · UNSOURCED 1 · UNVERIFIABLE 0

## OVERALL: FAIL — 2 incorrect, 1 unsourced material claim. Do not send as-is.

## Incorrect (must fix)
- [§Kept papers #3] "n=412" — source abstract states n=214.
  Evidence: PMID 40123456 abstract, "…214 patients were randomized…" [retrieved 2026-05-16T15:10Z]
- [§Headline] "primary endpoint met (p<0.01)" — source reports p=0.08, endpoint NOT met.
  Evidence: press release para 2 [retrieved 2026-05-16T15:12Z]

## Unsourced (must source or remove)
- [§Drivers] "management privately guided higher" — no citation; cannot verify. Remove or source.

## Questionable (analyst judgment)
- [§Findings] "drug causes tumor regression" — source says "associated with"; overstates causation.
- [§Assumptions] FX rate sourced 2026-01-02 — 134d old, exceeds 90d max. Confirm still current.
- [§Table] FY26 rev 11,650 vs narrative "≈11.6bn" — consistent but rounding undocumented.

## Verified (spot list)
- 18 items matched their sources exactly. IDs: [1,2,4,5,…]. Full table appended.

## Proposed corrections (NOT applied — for analyst)
- §Kept papers #3: 412 → 214 (per PMID 40123456 abstract).
- §Headline: remove "endpoint met"; source shows p=0.08, not significant.

## Could not verify
- (none — all cited sources were reachable this run)

---
Internal QA — not investment advice. The validator reports; it does not alter the source artifact or assert anything it did not read.
```

## Quality bar

- Every verdict carries the source locator and what the source *actually says* — not "looks fine".
- Zero items marked `VERIFIED` without the source having been read this run.
- The original artifact is unchanged; corrections are proposals only.
- `UNVERIFIABLE` is reported loudly, never quietly folded into a pass.

## Hard stops

- Never mark an item `VERIFIED` on memory or inference — only on a source read this run.
- Never edit or overwrite the artifact being audited.
- Never soften `INCORRECT` to `QUESTIONABLE` to make a document pass.
- Never assert investment advice or a rating — this is a correctness audit only.
