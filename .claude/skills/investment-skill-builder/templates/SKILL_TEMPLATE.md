---
name: <kebab-case-action-name>
description: <One sentence: what this produces.> Use when <the analyst's real trigger phrases + concrete cues: asset class, source names, cadence>. <Optional: when NOT to use.>
---

# <Skill Title>

<One paragraph: what this skill does, for whom, and what the finished output is.>

## When to use

- <trigger phrase the analyst actually says>
- <event/cadence that should kick this off>
- Do NOT use for: <out-of-scope cases — keep the skill focused>

## Inputs

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| <e.g. ticker> | yes | `VRTX` | |
| <e.g. model path> | no | `models/vrtx.xlsx` | defaults to <...> |

## Data sources & access

- **<Source>** — accessed via <API / file / paste-in>; needs <credential/entitlement or "public">.
- If <source/credential> is unavailable: <graceful-degradation behavior — say so explicitly, do not invent>.

## Workflow

1. <Step — concrete and checkable.>
2. <Step.>
3. **CHECKPOINT (if applicable):** STOP. Present <the diff / proposed changes>. Do not <write the model / assert the conclusion> until the analyst confirms.
4. <Step.>
5. Write the output artifact (see below).

## Decision rules

- Flag when: <explicit threshold, e.g. "primary endpoint changed OR enrollment date slips > 90 days">.
- Ignore: <noise the analyst doesn't care about>.
- Escalate to analyst when: <low-confidence / conflicting-source condition>.

## Output

Write to: `<path/destination>` (dated filename, e.g. `<name>-YYYY-MM-DD.md`).

Format (gold-standard example — match this exactly):

```
# <Title> — {RUN_DATE}
Inputs: <...>
Sources consulted: <list with retrieval timestamps>

## Findings
- <claim>  [source: <url/doc>, retrieved {TIMESTAMP}]  (confidence: high/med/low)

## What changed since last run
- <diff vs previous artifact, or "first run">

## Could not verify
- <items the agent could not source — surfaced, not hidden>

---
Internal research support, not investment advice. Sources used under <entitlement/ToS>.
```

## Quality bar

- Every material claim has a source + timestamp. No unsourced numbers.
- Uncertainty is reported, not smoothed over.
- <Analyst's specific "bad output looks like ___" from the interview.>

## Hard stops (never do autonomously)

- <e.g. overwrite the model file; change an estimate; state a rating.>
