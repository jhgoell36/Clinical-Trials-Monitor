"""Pull the most relevant scientific literature and clinical trials.

Sources:
  * EuropePMC REST API (covers PubMed/MEDLINE + PMC, open JSON, relevance
    ranking and citation counts; open-access full text where available).
  * ClinicalTrials.gov API v2 (the company's sponsored studies).
"""

import os

from . import config, util


def _clean_company_query(name):
    """EuropePMC affiliation/text query for the company."""
    base = name.replace('"', "").strip()
    short = base
    for suffix in (
        ", Inc.", " Inc.", " Inc", ", Inc", " Incorporated",
        " Corporation", " Corp.", " Corp", " Ltd.", " Ltd",
        " plc", " PLC", " LLC", " Co.", " Company", " Holdings",
        " Therapeutics", " Pharmaceuticals", " Pharma", " Biotherapeutics",
        " Biosciences", " Bio",
    ):
        if short.endswith(suffix):
            short = short[: -len(suffix)].strip()
            break
    return base, short


def fetch_literature(company_name, out_dir):
    lit_dir = os.path.join(out_dir, "literature")
    os.makedirs(lit_dir, exist_ok=True)
    result = {"query": "", "articles": [], "errors": []}

    full_name, short_name = _clean_company_query(company_name)
    query = (
        f'(AFF:"{short_name}" OR "{full_name}" OR "{short_name}") '
        f"AND (clinical OR trial OR therapy OR pharmacolog* OR antibody "
        f"OR oncology OR immunolog* OR mechanism)"
    )
    result["query"] = query

    try:
        data = util.get_json(
            config.EUROPEPMC_SEARCH,
            params={
                "query": query,
                "format": "json",
                "pageSize": config.MAX_LITERATURE,
                "sort": "CITED desc",
                "resultType": "core",
            },
        )
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"EuropePMC search failed: {exc}")
        return result

    hits = data.get("resultList", {}).get("result", [])
    util.progress("literature", f"{len(hits)} articles retrieved", count=len(hits))

    for art in hits:
        rec = {
            "title": art.get("title", "").strip(),
            "authors": art.get("authorString", ""),
            "journal": (art.get("journalInfo", {}) or {}).get("journal", {}).get("title")
            or art.get("bookOrReportDetails", {}).get("publisher", ""),
            "year": art.get("pubYear", ""),
            "pmid": art.get("pmid", ""),
            "pmcid": art.get("pmcid", ""),
            "doi": art.get("doi", ""),
            "source": art.get("source", ""),
            "citedBy": art.get("citedByCount", 0),
            "isOpenAccess": art.get("isOpenAccess", "N") == "Y",
            "abstract": (art.get("abstractText") or "").strip(),
            "url": (
                f"https://doi.org/{art.get('doi')}"
                if art.get("doi")
                else f"https://europepmc.org/abstract/{art.get('source','MED')}/{art.get('id','')}"
            ),
            "localPath": None,
        }

        if rec["pmcid"] and rec["isOpenAccess"]:
            fname = util.slugify(f"{rec['year']}_{rec['pmcid']}") + ".xml"
            dest = os.path.join(lit_dir, fname)
            try:
                url = config.EUROPEPMC_FULLTEXT.format(
                    source="PMC", pmcid=rec["pmcid"]
                )
                size, _ = util.download(url, dest)
                if size > 0:
                    rec["localPath"] = os.path.join("literature", fname)
            except Exception:  # noqa: BLE001 - abstract is enough on failure
                pass
        result["articles"].append(rec)

    return result


def fetch_trials(company_name, out_dir):
    """The company's sponsored studies from ClinicalTrials.gov v2."""
    result = {"sponsorQuery": company_name, "studies": [], "errors": []}
    try:
        data = util.get_json(
            config.CTGOV_STUDIES,
            params={
                "query.spons": company_name,
                "pageSize": 50,
                "sort": "LastUpdatePostDate:desc",
                "countTotal": "true",
            },
        )
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"ClinicalTrials.gov query failed: {exc}")
        return result

    result["total"] = data.get("totalCount", len(data.get("studies", [])))
    for s in data.get("studies", []):
        p = s.get("protocolSection", {})
        ident = p.get("identificationModule", {})
        status = p.get("statusModule", {})
        design = p.get("designModule", {})
        result["studies"].append(
            {
                "nctId": ident.get("nctId", ""),
                "title": ident.get("briefTitle", "")
                or ident.get("officialTitle", ""),
                "status": status.get("overallStatus", ""),
                "phase": ", ".join((design.get("phases") or []) or ["N/A"]),
                "lastUpdate": status.get("lastUpdatePostDateStruct", {}).get("date", ""),
                "url": f"https://clinicaltrials.gov/study/{ident.get('nctId','')}",
            }
        )
    util.progress(
        "trials",
        f"{len(result['studies'])} sponsored studies (of {result.get('total', 0)})",
        count=len(result["studies"]),
    )
    return result
