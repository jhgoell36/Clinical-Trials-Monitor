"""Orchestrate the end-to-end dossier build for one ticker."""

import os
import shutil

from . import edgar, ir_site, literature, report, tickers, util


def run(ticker, out_root, overrides=None, clean=True):
    ticker = ticker.upper().strip()
    out_dir = os.path.join(out_root, ticker)

    if clean and os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir, exist_ok=True)

    util.progress("resolve", f"Resolving ticker {ticker} to SEC CIK…")
    resolved = tickers.resolve(ticker, overrides=overrides)
    resolved["overrides"] = overrides or {}
    util.progress(
        "resolve",
        f"{ticker} → {resolved['name']} (CIK {resolved['cik']})",
        cik=resolved["cik"],
        name=resolved["name"],
    )

    util.progress("edgar", "Pulling financial filings from EDGAR…")
    edgar_data = edgar.fetch(resolved, out_dir)
    company = edgar_data.get("company") or {"name": resolved["name"]}

    util.progress("ir", "Scanning company site for presentations & posters…")
    ir_data = ir_site.fetch(resolved, company, out_dir)

    util.progress("trials", "Querying ClinicalTrials.gov for sponsored studies…")
    trials_data = literature.fetch_trials(
        company.get("name", resolved["name"]), out_dir
    )

    util.progress("literature", "Searching scientific literature (EuropePMC)…")
    lit_data = literature.fetch_literature(
        company.get("name", resolved["name"]), out_dir
    )

    util.progress("report", "Assembling the 10-page dossier…")
    report.build(resolved, edgar_data, ir_data, trials_data, lit_data, out_dir)

    summary = {
        "ticker": ticker,
        "name": company.get("name", resolved["name"]),
        "cik": resolved["cik"],
        "outDir": out_dir,
        "dossierPath": os.path.join(out_dir, "DOSSIER.md"),
        "manifestPath": os.path.join(out_dir, "manifest.json"),
        "counts": {
            "filings": sum(
                1 for f in edgar_data.get("filings", []) if f.get("status") == "ok"
            ),
            "presentations": sum(
                1 for d in ir_data.get("documents", []) if d.get("status") == "ok"
            ),
            "studies": len(trials_data.get("studies", [])),
            "literature": len(lit_data.get("articles", [])),
        },
    }
    util.progress("done", "Dossier complete", **summary["counts"])
    util.result(summary)
    return summary
