# Skill Authoring Guide

How to write a SKILL.md that an agent finds and runs well. Keep this in mind while generating skills.

## File layout

```
.claude/skills/<skill-name>/
  SKILL.md            # entry point — lean, the agent always reads this
  references/*.md      # detail loaded only when needed (rubrics, source quirks)
  scripts/*            # deterministic mechanics (API calls, parsing, diffs)
  templates/*          # output scaffolds, gold-standard examples
```

`<skill-name>` is kebab-case and names the **action** (`earnings-call-prep`), not the asset.

## Frontmatter

```yaml
---
name: kebab-case-name        # matches the directory
description: <trigger>        # the most important line in the whole skill
---
```

The `description` is how the agent decides to invoke the skill. Write it in the third person, state what the skill produces, and pack in the **concrete cues** that should trigger it — the asset classes, source names, cadence words, and the actual phrases the analyst uses. Vague descriptions ("helps with analysis") never fire. Add a "not for X" clause if the skill is easily confused with another.

Good: *"Pull and triage new PubMed publications for a drug/target watchlist; produce a dated, cited literature memo. Use when the analyst asks to check the literature, do a lit review, or monitor publications/abstracts for a drug, target, or indication."*

Bad: *"Literature helper for research."*

## Progressive disclosure — keep SKILL.md lean

The agent reads `SKILL.md` every time the skill fires. It should be a tight operating procedure, not a manual. Rule of thumb: if it's longer than ~150 lines, move detail out.

- **SKILL.md**: when to use, inputs, the numbered workflow, decision rules, output template, hard stops.
- **references/**: source-specific quirks, scoring rubrics, edge-case handling, long examples. Linked from SKILL.md, read on demand.
- **scripts/**: anything deterministic and repeatable.

## Scripts vs prose

- **Prose** for judgment: what to flag, how to weigh conflicting evidence, when to escalate.
- **Scripts** for mechanics: hitting an API, parsing a filing, diffing two files, formatting CSV. Scripts are deterministic, testable, don't drift, and don't burn tokens. If a step is the same every run, it's a script.

Have SKILL.md *call* the script and *interpret* its output, rather than re-deriving the mechanics in prose each run.

## Workflow section

Numbered, concrete, checkable steps. Each step should be something you could verify was done. Put human checkpoints in as their own numbered step with **STOP** in bold — not as a parenthetical.

## Output template

Embed a real, filled-in gold-standard example (sanitized) of the output. Agents match examples far more reliably than they follow abstract format descriptions. The example doubles as the acceptance test.

## Testing a skill

Not done until run against one real past case:
1. Get a real input + the output the analyst actually produced.
2. Run the skill.
3. Diff agent output vs analyst output. Tune thresholds and the template until they match.
4. Check the validation checklist in the builder's SKILL.md.

## Common mistakes

- Description too vague to trigger → no one uses the skill.
- Everything crammed in SKILL.md → slow, unmaintainable.
- Format described in prose instead of shown as an example → inconsistent output.
- Checkpoints written as soft suggestions → agent steamrolls them.
- Mechanics re-explained in prose every run instead of a script → drift and token waste.
- Skill scope creep → one skill trying to do lit review *and* the model *and* sentiment. One process per skill.
