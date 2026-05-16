"""Assemble the deep-research-style Markdown dossier + manifest + sources."""

import datetime
import json
import os

from . import util


def _h(title, level=2):
    return f"\n{'#' * level} {title}\n"


def _table(headers, rows):
    if not rows:
        return "_None found._\n"
    out = ["| " + " | ".join(headers) + " |",
           "| " + " | ".join("---" for _ in headers) + " |"]
    for r in rows:
        cells = [str(c).replace("|", "\\|").replace("\n", " ") for c in r]
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out) + "\n"


def _executive_summary(company, edgar, trials, lit, ir):
    name = company.get("name", "The company")
    sic = company.get("sicDescription", "n/a")
    inc = company.get("stateOfIncorporation", "n/a")
    exch = ", ".join(company.get("exchanges", []) or []) or "n/a"
    former = company.get("formerNames") or []
    n_filings = sum(1 for f in edgar.get("filings", []) if f.get("status") == "ok")
    n_studies = len(trials.get("studies", []))
    active = sum(
        1 for s in trials.get("studies", [])
        if s.get("status") in ("RECRUITING", "ACTIVE_NOT_RECRUITING", "ENROLLING_BY_INVITATION")
    )
    n_lit = len(lit.get("articles", []))
    n_pres = sum(1 for d in ir.get("documents", []) if d.get("status") == "ok")
    top_phase = {}
    for s in trials.get("studies", []):
        top_phase[s.get("phase", "N/A")] = top_phase.get(s.get("phase", "N/A"), 0) + 1
    phase_line = ", ".join(
        f"{k}: {v}" for k, v in sorted(top_phase.items(), key=lambda x: -x[1])
    ) or "n/a"

    former_line = ""
    if former:
        names = "; ".join(
            fn.get("name", "") for fn in former if isinstance(fn, dict)
        ) or "; ".join(map(str, former))
        former_line = f"- **Former name(s):** {names}\n"

    return (
        f"**{name}** is classified by the SEC under *{sic}* "
        f"(incorporated in {inc}; listed on {exch}). "
        f"This dossier consolidates **{n_filings} financial filings**, "
        f"**{n_pres} investor/scientific documents**, "
        f"**{n_studies} sponsored clinical studies** "
        f"({active} actively enrolling or ongoing), and "
        f"**{n_lit} peer-reviewed publications** into a single brief.\n\n"
        f"- **Clinical footprint:** {n_studies} studies on ClinicalTrials.gov "
        f"by development phase — {phase_line}.\n"
        f"- **Disclosure cadence:** {n_filings} material SEC filings retrieved "
        f"and stored locally for primary-source review.\n"
        f"- **Evidence base:** {n_lit} of the most-cited publications linked to "
        f"the company are catalogued with abstracts; open-access full text is "
        f"stored where licensing permits.\n"
        f"{former_line}"
        f"\n> **How to use this dossier:** start with §1–2 for the corporate and "
        f"financial picture, move to §3 for the clinical pipeline, then use §4–5 "
        f"to go deep on primary sources. Every catalogued item links both to the "
        f"original source and to the copy held in this folder.\n"
    )


def _reading_guide(edgar, trials):
    rows = []
    latest = {}
    for f in edgar.get("filings", []):
        if f.get("status") == "ok" and f["form"] not in latest:
            latest[f["form"]] = f
    guide = [
        ("Business model, risk factors, full financials", "10-K", "Annual report"),
        ("Most recent quarterly results & MD&A", "10-Q", "Quarterly report"),
        ("Material events, deals, data readouts", "8-K", "Current report"),
        ("Governance, compensation, ownership", "DEF 14A", "Proxy statement"),
        ("IPO / spin-off business description", "S-1", "Registration statement"),
        ("Spin-off / exchange-listing terms", "10-12B", "Form 10 registration"),
    ]
    for question, form, label in guide:
        f = latest.get(form)
        if f:
            rows.append([
                question,
                f"`{f['localPath']}`" if f.get("localPath") else "(not downloaded)",
                f"[{label} {f['filingDate']}]({f['indexUrl']})",
            ])
    if trials.get("studies"):
        rows.append([
            "Clinical pipeline status & phases",
            "§3 (this document)",
            "[ClinicalTrials.gov](https://clinicaltrials.gov/)",
        ])
    return _table(["To understand…", "Open this file", "Primary source"], rows)


def build(meta, edgar, ir, trials, lit, out_dir):
    company = edgar.get("company") or {"name": meta["name"]}
    generated = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    ticker = meta["ticker"]

    md = []
    md.append(f"# {company.get('name', meta['name'])} ({ticker}) — Research Dossier\n")
    md.append(
        f"*Generated {generated} · CIK {meta['cik']} · "
        f"ticker resolved via {meta.get('source','n/a')}*\n"
    )
    md.append(
        "> Auto-assembled from SEC EDGAR, the company's investor-relations site, "
        "ClinicalTrials.gov, and EuropePMC. All referenced files are stored in "
        "this folder so the dossier and its primary sources travel together.\n"
    )

    md.append(_h("Table of Contents", 2))
    md.append(
        "1. Executive Summary & Reading Guide\n"
        "2. Corporate & Financial Profile\n"
        "3. SEC Filings Catalogue\n"
        "4. Clinical Pipeline & Trials\n"
        "5. Investor Presentations & Scientific Posters\n"
        "6. Scientific Literature Review\n"
        "7. Key Themes & Open Questions\n"
        "8. Source Manifest & Data-Collection Notes\n"
    )

    # 1. Executive summary
    md.append(_h("1. Executive Summary & Reading Guide", 2))
    md.append(_executive_summary(company, edgar, trials, lit, ir))
    md.append(_h("Reading Guide — which file answers which question", 3))
    md.append(_reading_guide(edgar, trials))

    # 2. Corporate & financial profile
    md.append(_h("2. Corporate & Financial Profile", 2))
    addr = (company.get("addresses", {}) or {}).get("business", {}) or {}
    addr_line = ", ".join(
        x for x in [
            addr.get("street1"), addr.get("city"),
            addr.get("stateOrCountry"), addr.get("zipCode"),
        ] if x
    )
    md.append(_table(
        ["Field", "Value"],
        [
            ["Legal name", company.get("name", meta["name"])],
            ["Ticker(s)", ", ".join(company.get("tickers", [ticker]))],
            ["Exchange(s)", ", ".join(company.get("exchanges", []) or []) or "n/a"],
            ["SEC CIK", meta["cik"]],
            ["SIC", f"{company.get('sic','')} — {company.get('sicDescription','')}"],
            ["Industry category", company.get("category", "") or "n/a"],
            ["State of incorporation", company.get("stateOfIncorporation", "") or "n/a"],
            ["Fiscal year end", company.get("fiscalYearEnd", "") or "n/a"],
            ["Business address", addr_line or "n/a"],
            ["Website", company.get("website", "") or "n/a"],
        ],
    ))
    if company.get("formerNames"):
        md.append(_h("Former Names / Identity History", 3))
        rows = []
        for fn in company["formerNames"]:
            if isinstance(fn, dict):
                rows.append([fn.get("name", ""), fn.get("from", ""), fn.get("to", "")])
        md.append(_table(["Former name", "From", "To"], rows))
    md.append(
        "\n*Financial detail (revenue, cash runway, R&D spend, segment results) "
        "lives in the 10-K/10-Q/8-K documents catalogued in §3 and stored under "
        "`filings/`. Open the most recent 10-K for the audited annual picture and "
        "the latest 10-Q for the current quarter's MD&A.*\n"
    )

    # 3. Filings catalogue
    md.append(_h("3. SEC Filings Catalogue", 2))
    md.append(
        "Pulled directly from EDGAR (`data.sec.gov`). Each row links to the "
        "official filing index and, when downloaded, the local copy.\n"
    )
    frows = []
    for f in edgar.get("filings", []):
        local = f"`{f['localPath']}`" if f.get("localPath") else f"_{f['status']}_"
        frows.append([
            f["form"], f["filingDate"], f.get("reportDate", "") or "—",
            f"[index]({f['indexUrl']}) · [doc]({f['documentUrl']})",
            local,
        ])
    md.append(_table(
        ["Form", "Filed", "Period", "Source", "Local copy"], frows
    ))
    if edgar.get("errors"):
        md.append("\n**Collection notes:** " + "; ".join(edgar["errors"]) + "\n")

    # 4. Pipeline & trials
    md.append(_h("4. Clinical Pipeline & Trials", 2))
    md.append(
        f"Company-sponsored studies on ClinicalTrials.gov "
        f"(query: `{trials.get('sponsorQuery','')}`; "
        f"{trials.get('total', len(trials.get('studies', [])))} total matched).\n"
    )
    trows = [
        [
            f"[{s['nctId']}]({s['url']})", s["title"][:90],
            s["phase"], s["status"], s["lastUpdate"],
        ]
        for s in trials.get("studies", [])
    ]
    md.append(_table(
        ["NCT", "Title", "Phase", "Status", "Last update"], trows
    ))
    if trials.get("errors"):
        md.append("\n**Collection notes:** " + "; ".join(trials["errors"]) + "\n")

    # 5. Presentations & posters
    md.append(_h("5. Investor Presentations & Scientific Posters", 2))
    md.append(
        "Documents harvested from the company's own domain "
        f"(seeds: {', '.join(ir.get('seedUrls', [])) or 'none'}).\n"
    )
    prows = []
    for d in ir.get("documents", []):
        local = f"`{d['localPath']}`" if d.get("localPath") else f"_{d['status']}_"
        prows.append([d["title"][:80] or "(untitled)", f"[source]({d['url']})", local])
    md.append(_table(["Document", "Source", "Local copy"], prows))
    if ir.get("errors"):
        md.append("\n**Collection notes:** " + "; ".join(ir["errors"][:5]) + "\n")

    # 6. Literature review
    md.append(_h("6. Scientific Literature Review", 2))
    md.append(
        f"Top publications associated with the company, ranked by citation "
        f"count (EuropePMC query: `{lit.get('query','')}`).\n"
    )
    for i, a in enumerate(lit.get("articles", []), 1):
        md.append(f"\n**[{i}] {a['title']}**  \n")
        meta_bits = [
            a.get("authors", ""),
            a.get("journal", ""),
            str(a.get("year", "")),
            f"cited by {a.get('citedBy', 0)}",
        ]
        md.append("*" + " · ".join(b for b in meta_bits if b) + "*  \n")
        ids = []
        if a.get("doi"):
            ids.append(f"DOI [{a['doi']}](https://doi.org/{a['doi']})")
        if a.get("pmid"):
            ids.append(f"PMID [{a['pmid']}](https://pubmed.ncbi.nlm.nih.gov/{a['pmid']}/)")
        if a.get("localPath"):
            ids.append(f"full text: `{a['localPath']}`")
        else:
            ids.append(f"[abstract/online]({a['url']})")
        md.append(" · ".join(ids) + "  \n")
        if a.get("abstract"):
            text = a["abstract"]
            if len(text) > 900:
                text = text[:900].rstrip() + "…"
            md.append("\n> " + text.replace("\n", " ") + "\n")
    if lit.get("errors"):
        md.append("\n**Collection notes:** " + "; ".join(lit["errors"]) + "\n")

    # 7. Themes & open questions
    md.append(_h("7. Key Themes & Open Questions", 2))
    md.append(_themes(company, edgar, trials, lit))

    # 8. Manifest
    md.append(_h("8. Source Manifest & Data-Collection Notes", 2))
    md.append(
        "A machine-readable inventory of every source and downloaded file is in "
        "`manifest.json`; direct source URLs are also listed in `sources.md`. "
        "Files are organised as `filings/`, `presentations/`, `literature/`.\n"
    )
    md.append(
        f"\n*Dossier generated {generated}. Re-run the generator to refresh; "
        f"each run overwrites this folder for the ticker.*\n"
    )

    dossier_md = "\n".join(md)
    with open(os.path.join(out_dir, "DOSSIER.md"), "w", encoding="utf-8") as fh:
        fh.write(dossier_md)

    _write_manifest(meta, company, edgar, ir, trials, lit, generated, out_dir)
    _write_sources(meta, edgar, ir, trials, lit, out_dir)
    return dossier_md


def _themes(company, edgar, trials, lit):
    bullets = []
    sic = company.get("sicDescription", "").lower()
    if "pharmaceutical" in sic or "biological" in sic or "in vitro" in sic:
        bullets.append(
            "- **Clinical-stage risk profile.** As a life-sciences issuer, value "
            "is concentrated in pipeline readouts and regulatory milestones — "
            "cross-reference the trial table in §4 with 8-K data-readout filings "
            "in §3."
        )
    if any(f["form"].startswith("10-12B") or f["form"] == "10" for f in edgar.get("filings", [])):
        bullets.append(
            "- **Recent spin-off / new registrant.** A Form 10 is present, so "
            "treat historical financials cautiously and read the Form 10/S-1 "
            "business section first for the standalone thesis."
        )
    phases = [s.get("phase", "") for s in trials.get("studies", [])]
    if any("PHASE3" in p.replace(" ", "").upper() for p in phases):
        bullets.append(
            "- **Late-stage assets present.** One or more Phase 3 studies — "
            "registration timing and readouts are the key catalysts to track."
        )
    elif any("PHASE1" in p.replace(" ", "").upper() for p in phases):
        bullets.append(
            "- **Early-stage pipeline.** Predominantly Phase 1/2 — focus on "
            "safety, mechanism validation, and cash runway vs. milestone timing."
        )
    if lit.get("articles"):
        top = lit["articles"][0]
        bullets.append(
            f"- **Scientific anchor.** The most-cited associated paper is "
            f"\"{top['title']}\" ({top.get('year','')}, cited "
            f"{top.get('citedBy',0)}×) — a good entry point for the science."
        )
    bullets.append(
        "- **Open questions to resolve from primary sources:** cash runway and "
        "burn (latest 10-Q), going-concern language (10-K risk factors), "
        "insider/institutional ownership (DEF 14A / 13D-G), and any partnered "
        "vs. wholly-owned program economics (8-K material agreements)."
    )
    return "\n".join(bullets) + "\n"


def _write_manifest(meta, company, edgar, ir, trials, lit, generated, out_dir):
    manifest = {
        "ticker": meta["ticker"],
        "cik": meta["cik"],
        "company": company,
        "generatedUtc": generated,
        "counts": {
            "filings": len(edgar.get("filings", [])),
            "filingsDownloaded": sum(
                1 for f in edgar.get("filings", []) if f.get("status") == "ok"
            ),
            "presentations": len(ir.get("documents", [])),
            "studies": len(trials.get("studies", [])),
            "literature": len(lit.get("articles", [])),
        },
        "filings": edgar.get("filings", []),
        "presentations": ir.get("documents", []),
        "studies": trials.get("studies", []),
        "literature": lit.get("articles", []),
        "errors": {
            "edgar": edgar.get("errors", []),
            "ir": ir.get("errors", []),
            "trials": trials.get("errors", []),
            "literature": lit.get("errors", []),
        },
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)


def _write_sources(meta, edgar, ir, trials, lit, out_dir):
    lines = [f"# Source URLs — {meta['ticker']} (CIK {meta['cik']})\n"]
    lines.append("\n## SEC EDGAR filings\n")
    for f in edgar.get("filings", []):
        lines.append(f"- {f['form']} {f['filingDate']} — {f['indexUrl']}")
    lines.append("\n## Investor presentations / posters\n")
    for d in ir.get("documents", []):
        lines.append(f"- {d['title'][:80]} — {d['url']}")
    lines.append("\n## Clinical trials\n")
    for s in trials.get("studies", []):
        lines.append(f"- {s['nctId']} — {s['url']}")
    lines.append("\n## Literature\n")
    for a in lit.get("articles", []):
        lines.append(f"- {a['title'][:90]} — {a['url']}")
    with open(os.path.join(out_dir, "sources.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
