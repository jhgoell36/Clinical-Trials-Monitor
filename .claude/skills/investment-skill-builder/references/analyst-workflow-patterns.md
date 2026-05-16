# Analyst Workflow Patterns

Reusable building blocks. When generating a skill, pull the relevant patterns in verbatim and adapt the specifics. These exist because every analyst skill needs the same spine: get sourced data, prove where it came from, never invent, show what changed, and stop before touching anything that matters.

---

## 1. Source acquisition & access

State the source, the access method, and the fallback. Three access tiers:

- **Public API** (e.g. SEC EDGAR, ClinicalTrials.gov, NCBI E-utilities) — usable directly; respect rate limits and the documented usage policy.
- **Licensed / entitled** (Bloomberg, FactSet, broker research, paid social APIs) — only via the access the analyst confirms they have. Never scrape around a paywall. If the credential isn't present in the environment, the skill must say "requires <X> access — not available in this run" and continue with what it can.
- **Analyst-supplied** (pasted text, exported CSV, a model file in the repo) — the most reliable; prefer it when the analyst can provide it.

Always record *which* source produced *which* fact.

## 2. Citation & provenance discipline

Non-negotiable. Pattern for every material claim:

> `<claim>` — [source: <url or doc id or ticker+field>, retrieved <ISO timestamp>]

Rules:
- A claim with no source does not go in the output. It goes in "Could not verify".
- Quotes are verbatim and attributed; paraphrases are marked as such.
- Trial IDs (NCT…), accession numbers, filing types, and dates are copied, never reconstructed from memory.
- Keep the source list at the bottom of the artifact so it's auditable months later.

## 3. Anti-hallucination / verification

The single biggest failure mode. Enforce:
- The agent retrieves before it states. No "based on general knowledge" for prices, estimates, trial design, dates, or quotes.
- If two sources conflict, report both and flag the conflict — do not silently pick one.
- Numbers are reproduced exactly as found (units, currency, period). If a derived number is computed, show the formula and inputs.
- A confidence tag (high / med / low) on each finding. "Low" means surfaced for the analyst, not used as if true.

## 4. Structured, dated artifacts

Output is a file, not just chat. Every artifact starts with a header:

```
# <Title> — <RUN_DATE>
Inputs: <...>
Run by: agent (<skill-name>)
Sources consulted: <list + retrieval timestamps>
```

Filename carries the date: `<name>-YYYY-MM-DD.md` (or `.csv`/`.json`). This makes diffing and audit trivial.

## 5. Diff-since-last-run (recurring monitors)

For anything that runs on a cadence, the analyst wants *deltas*, not a re-dump.

- Locate the most recent prior artifact for the same inputs.
- Compare and produce a "What changed since last run" section: new items, removed items, changed fields (old → new).
- If first run, say "first run — full baseline below".
- Lead the artifact with the changes; the full state goes below for reference.

## 6. Human-in-the-loop checkpoints

Anything that writes a model, changes an estimate, or asserts a thesis/rating is **propose-then-confirm**:

> **CHECKPOINT:** STOP. Present the proposed change as a clear before→after diff with rationale and sources. Do not apply it until the analyst explicitly confirms. On confirm, apply and log it. On reject, record the reason and stop.

Make the checkpoint a hard stop in the workflow steps, not a footnote.

## 7. Confidence & uncertainty reporting

- Per-finding confidence tag.
- An explicit "Could not verify / data gaps" section every run — empty is fine, omitted is not.
- For sentiment/estimates/aggregates: report sample size and the main caveat (bot noise, thin volume, single-source).
- Never present a low-confidence inference with the same voice as a sourced fact.

## 8. Compliance & data-rights posture

End every artifact with a one-line footer, adapted to the source:

> Internal research support — not investment advice or a recommendation to transact. Source data used under <license/ToS>; not for redistribution.

Operational rules:
- Don't bypass paywalls or scrape sources in violation of their terms.
- Don't fabricate or imply MNPI handling; if the agent encounters something that looks like material non-public information, stop and flag to the analyst.
- Keep the audit trail (sources + timestamps) so the research is defensible.

## 9. Failure & rate-limit handling

- API/network failure: retry with backoff a few times, then degrade — report what was retrieved and what failed, don't silently drop coverage.
- Rate limits: respect documented limits; batch and pace requests.
- Partial results are labeled partial. Coverage gaps are stated in "Could not verify".
- A run that fails halfway still writes an artifact documenting how far it got.

## 10. Reproducibility & audit

Anyone re-running with the same inputs on the same data should get the same artifact. Record inputs, sources, timestamps, and any thresholds/parameters used in the run header so a result can be reconstructed and defended later.
