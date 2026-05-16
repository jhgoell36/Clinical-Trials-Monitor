---
name: investment-skill-builder
description: Build, scaffold, and refine Claude skills that turn an investment analyst's manual research processes into repeatable AI-agent workflows. Use when the user (an equity / biotech / credit / macro analyst) wants to automate or systematize a process — e.g. PubMed or literature monitoring, financial-model updates, social-media sentiment checks, competitor or clinical-trial tracking, earnings prep, channel checks — or wants to create, edit, or improve a SKILL.md for analyst work.
---

# Investment Analyst Skill Builder

This is a **meta-skill**: it interviews an analyst about one of their processes and produces a new, well-structured, production-grade Claude skill that an agent can run reliably.

The goal is not to write a clever prompt. It is to capture the analyst's judgment, data sources, and quality bar precisely enough that the agent does the work the way the analyst would — and flags the cases where it shouldn't act alone.

## When to use this skill

Trigger when the analyst says any of:
- "Build me a skill / agent / workflow that does X"
- "I do this process every week, automate it"
- "Turn my [model update / lit review / sentiment scan] into something an agent can run"
- "Make a SKILL.md for ..." or "improve this skill"

If the analyst describes a one-off question, just answer it — do **not** build a skill. Skills are for *repeated* processes.

## Core principles for analyst-agent skills

Every skill you generate must bake in these. They are non-negotiable for investment work; an agent that gets them wrong is worse than no agent.

1. **No fabrication, ever.** Numbers, quotes, citations, prices, trial IDs, and dates must come from a retrieved source. If a value can't be sourced, the skill must say "not found / not available" — never estimate to fill a gap silently.
2. **Provenance on every claim.** Each material fact carries its source (URL / document / ticker+date) and the retrieval timestamp. Outputs must be auditable months later.
3. **Human-in-the-loop on anything that touches a model or a thesis.** The agent proposes; the analyst approves. Never overwrite a financial model, change an estimate, or assert a rating without an explicit analyst checkpoint.
4. **Reproducible, dated artifacts.** Output is a structured file (markdown/CSV/JSON) stamped with run date, inputs, and source list — not just chat text.
5. **Confidence and uncertainty are first-class.** The skill must report how sure it is and surface what it could not verify, rather than presenting everything with equal confidence.
6. **Diff against last run** for any recurring monitor — the analyst cares about *what changed*, not a re-dump of everything.
7. **Compliance posture.** Output is internal research support, not investment advice or a recommendation to trade. Respect data-source terms of service and licensing; don't scrape sources the analyst isn't entitled to.

Detailed, reusable implementations of these are in `references/analyst-workflow-patterns.md`. Reference it when building any skill.

## Workflow

Create a todo list with these steps and work through them in order.

### 1. Interview the analyst

Do not skip this. A skill is only as good as the process capture. Ask the questions below — batch them, and use sensible defaults when the analyst says "you decide", but get the starred (★) ones explicitly.

- **Process name & one-line purpose.** What does this produce and who reads it?
- **★ Trigger & cadence.** On demand? Daily/weekly? Event-driven (earnings, data readout, filing)?
- **★ Inputs.** What does the analyst give it (ticker, drug, NCT ID, model file path, watchlist)?
- **★ Data sources & access.** Exactly which sources, and *how* are they reached — public API, licensed terminal, internal file, paste-in? What credentials/entitlements exist? (If a source needs a key or a paid login the agent doesn't have, the skill must degrade gracefully and say so.)
- **★ The steps, in the analyst's own words.** Walk through one real past instance end to end.
- **Decision rules / heuristics.** "I flag a trial if enrollment slips >3 months." "I only care about KOL accounts." Capture the thresholds.
- **★ Output format & destination.** Memo? Table? Model cells? Slack-ready bullets? Where does it land?
- **Quality bar & failure modes.** What does a *bad* output look like? What has burned them before?
- **What the agent must NOT do autonomously.** The hard stops.

If the analyst is vague on a starred item, ask a focused follow-up rather than guessing — wrong assumptions here compound.

### 2. Decide: new skill, or edit existing

Search `.claude/skills/` first. If a close skill exists, improve it instead of duplicating. Three worked, ready-to-run examples already exist and are the best starting points to clone or adapt:
- `pubmed-literature-review` — literature / scientific monitoring
- `financial-model-update` — spreadsheet-model maintenance with sign-off
- `social-sentiment-check` — social/news sentiment aggregation

Read the closest example before writing — match its structure.

### 3. Scaffold the skill

- Pick a kebab-case name that reads as the *action* (`earnings-call-prep`, `competitor-trial-tracker`), not the asset.
- Create `.claude/skills/<name>/SKILL.md` from `templates/SKILL_TEMPLATE.md`.
- Write the **description** as a precise trigger: what it does + concrete cues that should invoke it (asset classes, source names, the phrases the analyst actually uses). This field is how the agent finds the skill — be specific, third person, no fluff.
- Keep `SKILL.md` lean. Push long instructions, source-specific quirks, and rubrics into `references/`; push deterministic, repeatable mechanics (API calls, file diffs, parsing) into `scripts/`. Progressive disclosure keeps the agent fast and the skill maintainable. See `references/skill-authoring-guide.md`.

### 4. Encode the process

Translate the interview into the skill body:
- A numbered workflow the agent follows.
- The decision rules/thresholds as explicit, checkable conditions.
- The exact output template (copy a real past example into the skill as the gold standard).
- The human checkpoints, written as hard stops ("STOP and present the diff; do not write the file until the analyst confirms").
- Inject the relevant patterns from `references/analyst-workflow-patterns.md` (citation discipline, diff-since-last-run, confidence reporting, compliance line).

### 5. Add scripts for the deterministic parts

If the process has a mechanical core (hit an API, parse a filing, diff a spreadsheet), write a small script in `scripts/` and have `SKILL.md` call it. Scripts are deterministic, testable, and don't burn tokens — prose is for judgment, scripts are for mechanics.

### 6. Validate

Run this checklist against the generated skill. Fix anything that fails before declaring done:

- [ ] Frontmatter valid; `description` would actually trigger on the analyst's real phrasing.
- [ ] Every output claim has a source + timestamp path; no step invents data.
- [ ] At least one human checkpoint exists before any model write / thesis assertion (if applicable).
- [ ] Output is a dated, structured artifact, not just chat.
- [ ] Recurring? It diffs against the last run.
- [ ] Confidence/uncertainty is reported; unverifiable items are surfaced, not hidden.
- [ ] Graceful degradation when a source/credential is unavailable.
- [ ] Compliance line present (internal research, not advice; respects source ToS).
- [ ] `SKILL.md` is lean; detail lives in references/scripts.

### 7. Test on a real case

Ask the analyst for one real past input and expected output. Dry-run the skill against it (mentally or actually) and compare to what they would have produced. Tune thresholds and the output template until it matches their work. A skill that hasn't been run against a real case is not done.

### 8. Hand off

Tell the analyst: the skill's name, exactly what phrases invoke it, what it produces, where output lands, and which steps require their sign-off. Commit the skill on the working branch.

## Anti-patterns to refuse or fix

- A skill that scrapes a paywalled/licensed source the analyst can't legally redistribute → flag, use entitled access only.
- A skill that auto-edits the financial model or changes estimates with no checkpoint → add a hard stop.
- A skill that outputs a number with no source → broken; fix before shipping.
- "Summarize sentiment and tell me if I should buy" → reframe as evidence aggregation; the analyst decides.
- A 600-line SKILL.md → split into references; the agent shouldn't read a manual to start.

## Files in this skill

- `templates/SKILL_TEMPLATE.md` — the scaffold to fill in for every new skill.
- `references/analyst-workflow-patterns.md` — reusable, copy-in building blocks (sourcing, citation, diffing, checkpoints, compliance).
- `references/skill-authoring-guide.md` — how to write a good SKILL.md (frontmatter, descriptions, progressive disclosure, scripts vs prose).
- Example skills (siblings in `.claude/skills/`): `pubmed-literature-review`, `financial-model-update`, `social-sentiment-check`.
