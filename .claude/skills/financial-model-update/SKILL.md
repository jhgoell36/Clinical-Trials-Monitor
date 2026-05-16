---
name: financial-model-update
description: Update the assumption/input cells of a financial model spreadsheet from sourced inputs, with a mandatory analyst sign-off before any write, plus a backup and a change log. Use when the analyst asks to update the model, refresh estimates/assumptions, roll the model forward after earnings/a data readout, or plug in new guidance/consensus/pricing for a company.
---

# Financial Model Update

Refreshes the **input/assumption cells** of an analyst's spreadsheet model from sourced data, then proposes the change as a before→after diff that the analyst must approve before anything is written. The agent never silently edits the model and never touches formula/output cells.

## When to use

- "Update the model for <ticker> with the new guidance"
- "Roll the model forward after earnings"
- "Refresh consensus / pricing / FX assumptions in the model"
- Do NOT use for: building a new model from scratch, restructuring model logic, or changing formulas — those are analyst decisions, not an agent task.

## Inputs

| Input | Required | Example | Notes |
|-------|----------|---------|-------|
| Model file path | yes | `models/vrtx.xlsx` | the workbook to update |
| Inputs to change | yes | guidance, consensus, FX, share count | each must come with a source |
| Source(s) | yes | 10-Q, press release, transcript | sourced values only — no estimates from memory |

## Data sources & access

- Analyst-supplied documents (filing, press release, transcript, terminal export) are the source of truth. Quote the exact figure and where it came from.
- If a needed figure isn't in the provided sources: do **not** fill it. List it under "Needs analyst input" and leave the cell unchanged.

## Workflow

1. Back up the workbook first: copy to `<name>.bak-YYYY-MM-DD-HHMM.xlsx`. No update proceeds without a backup.
2. Identify the assumption/input cells to change. Only cells the analyst designates as inputs (named ranges, an "Assumptions" tab, or explicitly listed cells). **Never modify cells containing formulas or model outputs.**
3. For each value, extract the new figure from the provided source. Record: cell, old value, new value, source, exact quote/locator, retrieval timestamp.
4. Run `python3 scripts/model_diff.py <model> --proposed proposed.json` to render a clean before→after table (proposed.json is the change set you built in step 3). The script reads the workbook read-only; it does not write.
5. **CHECKPOINT — STOP.** Present the diff table, the source for each change, and any "Needs analyst input" gaps. Do **not** write the workbook. Ask the analyst to approve, edit, or reject the change set.
6. On approval only: apply the approved changes to the cells, save, and write the change log. On rejection: record the reason, keep the backup, change nothing.
7. Sanity-check after write: confirm only the approved input cells changed (re-diff backup vs updated). Report any unexpected delta as an error.

## Decision rules

- One source disagrees with another → present both, do not pick; flag for analyst.
- A change moves an input by an outsized amount (e.g. >25% vs prior) → highlight it explicitly in the diff so it can't slip through.
- Currency/units/period must match the cell's existing convention; convert only with the conversion shown.

## Output

1. Updated workbook (only after approval).
2. Change log: `model-update-<ticker>-YYYY-MM-DD.md`

Gold-standard change log — match exactly:

```
# Model Update — VRTX — 2026-05-16
Model: models/vrtx.xlsx | Backup: models/vrtx.bak-2026-05-16-1402.xlsx
Approved by analyst: <name> at 2026-05-16T14:10Z

## Applied changes
| Cell / Range        | Old      | New      | Source                                   |
|---------------------|----------|----------|------------------------------------------|
| Assumptions!FY26_Rev| 11,200   | 11,650   | Q1'26 PR, "raising FY26 revenue guide…" [retrieved 2026-05-16T14:02Z] |
| Assumptions!ShCount | 258.1    | 257.4    | 10-Q cover, dil. shares [retrieved …]    |

## Needs analyst input (left unchanged)
- FY27 opex assumption — not in provided sources.

## Post-write verification
- Diff backup vs updated: only the 2 approved input cells changed. OK.

---
Internal research support — not investment advice. Figures transcribed from analyst-supplied filings/press materials.
```

## Quality bar

- Backup exists before any write. Always.
- Every applied change has a source + quote/locator + timestamp. No unsourced cell change.
- Post-write diff confirms *only* approved cells moved. Any other delta is an error to report, not to ignore.

## Hard stops

- Never write the workbook before explicit analyst approval of the diff.
- Never modify formula or output cells.
- Never invent a figure to fill a cell — leave it and flag it.
