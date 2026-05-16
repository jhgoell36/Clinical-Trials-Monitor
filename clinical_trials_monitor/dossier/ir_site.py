"""Discover and download investor presentations and scientific posters.

This is inherently heuristic: IR sites have no standard layout. The crawler
stays on the company's own domain, limits breadth/depth, and only keeps
documents (PDF/PPT/PPTX) whose link text or URL looks like a presentation,
poster, or scientific publication. A seed IR URL can be supplied via the
overrides map for sites the heuristics miss.
"""

import os
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from . import config, util

_DOC_EXT_RE = re.compile(r"\.(pdf|pptx?|key)(\?|$)", re.IGNORECASE)


def _domain(url):
    return urlparse(url).netloc.lower().replace("www.", "")


def _looks_relevant(text, href):
    blob = f"{text} {href}".lower()
    return any(h in blob for h in config.PRESENTATION_HINTS)


def _candidate_seed_urls(resolved, company):
    seeds = []
    overrides = (resolved.get("overrides") or {}).get(resolved["ticker"], {})
    if overrides.get("irUrl"):
        seeds.append(overrides["irUrl"])

    site = (company.get("website") or "").strip()
    if site:
        if not site.startswith("http"):
            site = "https://" + site
        seeds.append(site)
        base = f"{urlparse(site).scheme}://{urlparse(site).netloc}"
        for path in ("/investors", "/investor-relations", "/news",
                     "/events-and-presentations", "/publications", "/science"):
            seeds.append(base + path)

    # de-dup, keep order
    seen, out = set(), []
    for s in seeds:
        if s and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def fetch(resolved, company, out_dir):
    pres_dir = os.path.join(out_dir, "presentations")
    os.makedirs(pres_dir, exist_ok=True)

    result = {"seedUrls": [], "documents": [], "errors": []}
    seeds = _candidate_seed_urls(resolved, company)
    result["seedUrls"] = seeds

    if not seeds:
        result["errors"].append(
            "No company website on EDGAR and no irUrl override supplied; "
            "skipping presentation/poster collection."
        )
        util.progress("ir", "no IR seed URL available", count=0)
        return result

    allowed = {_domain(s) for s in seeds}
    visited = set()
    queue = [(s, 0) for s in seeds]
    found_docs = {}

    while queue and len(found_docs) < config.MAX_PRESENTATIONS:
        url, depth = queue.pop(0)
        if url in visited or depth > 2:
            continue
        visited.add(url)
        try:
            resp = util.get(url)
            if resp.status_code >= 400:
                continue
            ctype = resp.headers.get("Content-Type", "")
            if "html" not in ctype:
                continue
            soup = BeautifulSoup(resp.text, "html.parser")
        except Exception as exc:  # noqa: BLE001
            result["errors"].append(f"crawl {url}: {exc}")
            continue

        for a in soup.find_all("a", href=True):
            href = urljoin(url, a["href"].strip())
            text = " ".join(a.get_text(" ", strip=True).split())
            if _domain(href) not in allowed:
                continue

            if _DOC_EXT_RE.search(href) and _looks_relevant(text, href):
                if href not in found_docs:
                    found_docs[href] = text or os.path.basename(urlparse(href).path)
            elif (
                depth < 2
                and href not in visited
                and any(h in href.lower() for h in config.IR_PATH_HINTS)
            ):
                queue.append((href, depth + 1))

    util.progress("ir", f"{len(found_docs)} candidate documents found",
                  count=len(found_docs))

    for href, label in list(found_docs.items())[: config.MAX_PRESENTATIONS]:
        ext = (_DOC_EXT_RE.search(href).group(1) if _DOC_EXT_RE.search(href) else "pdf").lower()
        base = util.slugify(label or os.path.basename(urlparse(href).path) or "document")
        fname = f"{base}.{ext}"
        dest = os.path.join(pres_dir, fname)
        n = 1
        while os.path.exists(dest):
            fname = f"{base}-{n}.{ext}"
            dest = os.path.join(pres_dir, fname)
            n += 1
        rec = {"title": label, "url": href, "localPath": None, "status": "pending"}
        try:
            size, ctype = util.download(href, dest)
            rec["localPath"] = os.path.join("presentations", fname)
            rec["bytes"] = size
            rec["contentType"] = ctype
            rec["status"] = "ok"
        except Exception as exc:  # noqa: BLE001
            rec["status"] = f"download-failed: {exc}"
            result["errors"].append(f"{href}: {exc}")
        result["documents"].append(rec)

    ok = sum(1 for d in result["documents"] if d["status"] == "ok")
    util.progress("ir", f"downloaded {ok} presentation/poster files", downloaded=ok)
    return result
