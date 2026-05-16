"""Pull financial filings directly from SEC EDGAR."""

import os

from . import config, util


def _collect_recent(submissions):
    """Flatten the submissions JSON 'recent' block into a list of filing dicts."""
    recent = submissions.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    out = []
    for i in range(len(forms)):
        out.append(
            {
                "form": recent["form"][i],
                "accession": recent["accessionNumber"][i],
                "filingDate": recent["filingDate"][i],
                "reportDate": (recent.get("reportDate") or [""] * len(forms))[i],
                "primaryDocument": (recent.get("primaryDocument") or [""] * len(forms))[i],
                "primaryDocDescription": (
                    recent.get("primaryDocDescription") or [""] * len(forms)
                )[i],
            }
        )
    return out


def _select(filings):
    """Keep material forms, newest first, capped per-form and overall."""
    wanted = set(config.FILING_FORMS)
    filings = [f for f in filings if f["form"] in wanted]
    filings.sort(key=lambda f: f["filingDate"], reverse=True)

    per_form = {}
    selected = []
    for f in filings:
        n = per_form.get(f["form"], 0)
        if n >= config.MAX_PER_FORM:
            continue
        per_form[f["form"]] = n + 1
        selected.append(f)
        if len(selected) >= config.MAX_FILINGS:
            break
    return selected


def _doc_url(cik, accession, document):
    acc_nodash = accession.replace("-", "")
    return f"{config.SEC_ARCHIVES_BASE}/{cik}/{acc_nodash}/{document}"


def _index_url(cik, accession):
    acc_nodash = accession.replace("-", "")
    return f"{config.SEC_ARCHIVES_BASE}/{cik}/{acc_nodash}/{accession}-index.htm"


def fetch(resolved, out_dir):
    """Download selected filings into out_dir/filings/.

    Returns a dict with company metadata and a list of filing records.
    Network failures degrade gracefully: the run continues and the gap
    is recorded so the report can surface it.
    """
    cik = resolved["cik"]
    filings_dir = os.path.join(out_dir, "filings")
    os.makedirs(filings_dir, exist_ok=True)

    result = {
        "company": {},
        "filings": [],
        "errors": [],
    }

    try:
        submissions = util.get_json(
            config.SEC_SUBMISSIONS_URL.format(cik10=resolved["cik10"])
        )
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        result["errors"].append(f"Could not load EDGAR submissions: {exc}")
        return result

    result["company"] = {
        "name": submissions.get("name", resolved["name"]),
        "cik": cik,
        "tickers": submissions.get("tickers", [resolved["ticker"]]),
        "exchanges": submissions.get("exchanges", []),
        "sic": submissions.get("sic", ""),
        "sicDescription": submissions.get("sicDescription", ""),
        "fiscalYearEnd": submissions.get("fiscalYearEnd", ""),
        "stateOfIncorporation": submissions.get("stateOfIncorporation", ""),
        "website": (submissions.get("website") or "").strip(),
        "category": submissions.get("category", ""),
        "ein": submissions.get("ein", ""),
        "addresses": submissions.get("addresses", {}),
        "formerNames": submissions.get("formerNames", []),
    }

    selected = _select(_collect_recent(submissions))
    util.progress("edgar", f"{len(selected)} material filings selected", count=len(selected))

    for f in selected:
        acc = f["accession"]
        doc = f["primaryDocument"] or ""
        index_url = _index_url(cik, acc)
        record = {
            "form": f["form"],
            "filingDate": f["filingDate"],
            "reportDate": f["reportDate"],
            "accession": acc,
            "description": f["primaryDocDescription"],
            "indexUrl": index_url,
            "documentUrl": _doc_url(cik, acc, doc) if doc else index_url,
            "localPath": None,
            "status": "pending",
        }
        if not doc:
            record["status"] = "no-primary-document"
            result["filings"].append(record)
            continue

        ext = os.path.splitext(doc)[1] or ".htm"
        fname = util.slugify(f"{f['filingDate']}_{f['form']}_{acc}") + ext
        dest = os.path.join(filings_dir, fname)
        try:
            size, ctype = util.download(record["documentUrl"], dest)
            record["localPath"] = os.path.join("filings", fname)
            record["bytes"] = size
            record["contentType"] = ctype
            record["status"] = "ok"
        except Exception as exc:  # noqa: BLE001
            record["status"] = f"download-failed: {exc}"
            result["errors"].append(f"{f['form']} {acc}: {exc}")
        result["filings"].append(record)

    ok = sum(1 for r in result["filings"] if r["status"] == "ok")
    util.progress("edgar", f"downloaded {ok}/{len(selected)} filings", downloaded=ok)
    return result
