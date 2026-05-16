#!/usr/bin/env python3
"""Deterministic pre-checks for the research-validator skill.

Stdlib only. This does NOT judge whether a source supports a claim — that
is semantic work the skill does by actually reading sources. This only does
the mechanical checks that can be wrong on their face:

  - claim-looking lines with no [source: ...] citation
  - source tags missing a retrieval timestamp, or stale vs --asof
  - failed arithmetic (A op B = C) and stated %-change vs raw figures
  - the same labelled metric stated with two different numbers
  - malformed URLs (and optional reachability with --check-urls)

It is a seed list for the validator, never the whole audit. Exit code is
always 0; the skill interprets the findings.

Usage:
    python3 precheck.py <artifact> [--asof YYYY-MM-DD] [--max-age-days N]
                                   [--check-urls]
"""
import re
import sys
import argparse
import datetime
import urllib.parse
import urllib.request

# Sign must sit directly on the digits — no space — so a markdown bullet
# "- 100" is read as 100, not -100.
NUM = r"[-+]?[\$€£]?\d[\d,]*(?:\.\d+)?"
ASSERT = ("shows", "show", "met", "missed", "increased", "decreased",
          "raised", "cut", "beat", "reported", "guided", "approved",
          "failed", "rose", "fell", "grew", "declined", "causes", "caused",
          "demonstrated", "confirmed", "significant")
# Headings whose bullets legitimately carry no source.
NO_SOURCE_OK = ("could not verify", "proposed correction", "caveat",
                "sample & method", "method", "what changed since",
                "gaps", "needs analyst input", "next:")


def to_float(tok):
    t = tok.strip().replace(",", "")
    for s in "$€£ ":
        t = t.replace(s, "")
    try:
        return float(t)
    except ValueError:
        return None


def close(a, b, rel=0.005, abstol=0.01):
    return abs(a - b) <= max(abstol, rel * max(abs(a), abs(b)))


def check_provenance(lines):
    out = []
    heading = ""
    for i, ln in enumerate(lines, 1):
        s = ln.strip()
        if s.startswith("#"):
            heading = s.lstrip("# ").lower()
            continue
        if heading and any(k in heading for k in NO_SOURCE_OK):
            continue
        is_item = bool(re.match(r"^([-*]|\d+\.)\s+\S", s)) or s.startswith("|")
        if not is_item:
            continue
        has_num = re.search(NUM, s) is not None
        has_assert = any(re.search(rf"\b{w}\b", s.lower()) for w in ASSERT)
        if (has_num or has_assert) and "[source:" not in s.lower() \
                and "source:" not in s.lower():
            out.append(f"  L{i}: claim with no [source:] -> {s[:90]}")
    return out


def check_timestamps(text, asof, max_age):
    out = []
    for m in re.finditer(r"\[source:[^\]]*\]", text, re.I):
        tag = m.group(0)
        ts = re.search(r"retrieved\s+([0-9]{4}-[0-9]{2}-[0-9]{2})", tag, re.I)
        if not ts:
            out.append(f"  source tag missing retrieval date -> {tag[:80]}")
            continue
        try:
            d = datetime.date.fromisoformat(ts.group(1))
        except ValueError:
            out.append(f"  unparseable retrieval date -> {tag[:80]}")
            continue
        age = (asof - d).days
        if age > max_age:
            out.append(f"  stale source: retrieved {d} = {age}d old "
                        f"(>{max_age}d) -> {tag[:80]}")
    return out


def check_arithmetic(text):
    out = []
    pat = re.compile(rf"({NUM})\s*([+\-*/x×])\s*({NUM})\s*=\s*({NUM})")
    for m in pat.finditer(text):
        a, op, b, c = (to_float(m.group(1)), m.group(2),
                       to_float(m.group(3)), to_float(m.group(4)))
        if None in (a, b, c):
            continue
        try:
            r = {"+": a + b, "-": a - b, "*": a * b, "x": a * b,
                 "×": a * b, "/": a / b if b else None}[op]
        except ZeroDivisionError:
            r = None
        if r is not None and not close(r, c):
            out.append(f"  arithmetic off: {m.group(0)}  (expected {r:g})")
    # stated % change: "A -> B (+P%)" or "A → B (-P%)"
    chg = re.compile(rf"({NUM})\s*(?:->|→|to)\s*({NUM})\s*\(\s*([-+]?\d+(?:\.\d+)?)\s*%")
    for m in chg.finditer(text):
        a, b, p = to_float(m.group(1)), to_float(m.group(2)), to_float(m.group(3))
        if None in (a, b, p) or a == 0:
            continue
        actual = (b - a) / abs(a) * 100
        if not close(actual, p, rel=0.02, abstol=0.5):
            out.append(f"  %-change off: {m.group(0)}  (actual {actual:+.1f}%)")
    return out


def check_consistency(text):
    out = []
    seen = {}
    for m in re.finditer(rf"([A-Za-z][\w /%'\-]{{2,40}}?)\s*[:=|]\s*({NUM})", text):
        label = re.sub(r"\s+", " ", m.group(1).strip().lower())
        val = to_float(m.group(2))
        if val is None or len(label) < 3:
            continue
        seen.setdefault(label, set()).add(round(val, 6))
    for label, vals in seen.items():
        if len(vals) > 1:
            out.append(f"  '{label}' stated with differing values: "
                       f"{sorted(vals)}")
    return out


def check_urls(text, do_fetch):
    out = []
    for u in set(re.findall(r"https?://[^\s)\]>\"]+", text)):
        p = urllib.parse.urlparse(u)
        if not p.scheme or not p.netloc:
            out.append(f"  malformed URL -> {u}")
            continue
        if not do_fetch:
            continue
        try:
            req = urllib.request.Request(u, method="HEAD",
                                         headers={"User-Agent": "research-validator"})
            with urllib.request.urlopen(req, timeout=8) as r:
                if r.status >= 400:
                    out.append(f"  URL HTTP {r.status} -> {u}")
        except Exception as e:  # noqa: BLE001
            out.append(f"  URL unchecked (network/error: "
                       f"{type(e).__name__}) -> {u}")
    return out


def section(title, items):
    print(f"\n## {title} ({len(items)})")
    if not items:
        print("  (none)")
    for it in items:
        print(it)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("artifact")
    ap.add_argument("--asof", default=str(datetime.date.today()))
    ap.add_argument("--max-age-days", type=int, default=90)
    ap.add_argument("--check-urls", action="store_true")
    a = ap.parse_args()

    try:
        text = open(a.artifact, encoding="utf-8").read()
    except OSError as e:
        print(f"ERROR: cannot read artifact: {e}")
        sys.exit(1)
    try:
        asof = datetime.date.fromisoformat(a.asof)
    except ValueError:
        print(f"ERROR: bad --asof date: {a.asof}")
        sys.exit(1)

    lines = text.splitlines()
    print(f"# precheck — {a.artifact}  (as-of {asof}, max age "
          f"{a.max_age_days}d)")
    print("Mechanical seed list only — the validator must still read each "
          "cited source. Items below are NOT yet verdicts.")
    section("Unsourced claim-looking lines", check_provenance(lines))
    section("Citation timestamp / staleness", check_timestamps(text, asof, a.max_age_days))
    section("Arithmetic", check_arithmetic(text))
    section("Possible internal inconsistencies", check_consistency(text))
    section("URL hygiene", check_urls(text, a.check_urls))


if __name__ == "__main__":
    main()
