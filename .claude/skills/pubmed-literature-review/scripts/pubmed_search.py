#!/usr/bin/env python3
"""Query NCBI PubMed via E-utilities and emit structured JSON.

Stdlib only. Returns ONLY what NCBI returns — never synthesizes content.

Usage:
    python3 pubmed_search.py "<query>" [--days N] [--retmax M]

Output: JSON to stdout: {"query","retrieved_utc","count","records":[...]}
Each record: pmid, title, journal, pub_date, authors, doi, abstract, url.
On NCBI failure: retries with backoff, then exits non-zero with a JSON error
so the calling skill can document the coverage gap (no fabricated results).
"""
import sys
import json
import time
import argparse
import datetime
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
TOOL = "investment-analyst-pubmed-skill"


def _get(url, attempts=4):
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": TOOL})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - degrade gracefully, never fabricate
            last = e
            time.sleep(2 ** i)
    raise RuntimeError(f"NCBI unreachable after {attempts} attempts: {last}")


def esearch(query, days, retmax):
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": str(retmax),
        "sort": "date",
        "tool": TOOL,
        "retmode": "json",
    }
    if days:
        params["reldate"] = str(days)
        params["datetype"] = "pdat"
    data = json.loads(_get(f"{EUTILS}/esearch.fcgi?{urllib.parse.urlencode(params)}"))
    return data.get("esearchresult", {}).get("idlist", [])


def _text(node):
    return "".join(node.itertext()).strip() if node is not None else ""


def efetch(pmids):
    if not pmids:
        return []
    params = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
        "tool": TOOL,
    }
    root = ET.fromstring(_get(f"{EUTILS}/efetch.fcgi?{urllib.parse.urlencode(params)}"))
    out = []
    for art in root.findall(".//PubmedArticle"):
        pmid = _text(art.find(".//PMID"))
        title = _text(art.find(".//ArticleTitle"))
        journal = _text(art.find(".//Journal/Title"))
        abstract = " ".join(
            _text(a) for a in art.findall(".//Abstract/AbstractText")
        ).strip()
        authors = []
        for a in art.findall(".//AuthorList/Author"):
            ln, fn = _text(a.find("LastName")), _text(a.find("Initials"))
            if ln:
                authors.append(f"{ln} {fn}".strip())
        doi = ""
        for idn in art.findall(".//ArticleIdList/ArticleId"):
            if idn.get("IdType") == "doi":
                doi = _text(idn)
        pd = art.find(".//JournalIssue/PubDate")
        pub_date = "-".join(
            _text(pd.find(t)) for t in ("Year", "Month", "Day") if pd is not None and pd.find(t) is not None
        )
        out.append({
            "pmid": pmid,
            "title": title,
            "journal": journal,
            "pub_date": pub_date,
            "authors": authors,
            "doi": doi,
            "abstract": abstract,
            "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        })
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("query")
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--retmax", type=int, default=50)
    args = p.parse_args()

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        pmids = esearch(args.query, args.days, args.retmax)
        time.sleep(0.4)  # stay under the 3 req/s public limit
        records = efetch(pmids)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e), "query": args.query,
                          "retrieved_utc": now, "records": []}))
        sys.exit(2)

    print(json.dumps({
        "query": args.query,
        "retrieved_utc": now,
        "count": len(records),
        "records": records,
    }, indent=2))


if __name__ == "__main__":
    main()
