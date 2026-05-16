#!/usr/bin/env python3
"""Aggregate agent-classified social posts into a sentiment read.

Stdlib only. Does NOT classify and does NOT fetch — it only does the
deterministic math over a CSV the skill already labeled, so the read is
reproducible and the judgment stays with the model + analyst.

Input CSV columns (header required):
    label,confidence,handle,timestamp,url,text
    label in {bullish,bearish,neutral,factual-news}; confidence 0..1

Usage:
    python3 sentiment_aggregate.py posts.csv [--baseline N]

--baseline N = prior usable-post volume, to compute the spike multiple.
"""
import sys
import csv
import argparse
from collections import defaultdict

VALID = {"bullish", "bearish", "neutral", "factual-news"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("csv_path")
    p.add_argument("--baseline", type=float, default=None)
    args = p.parse_args()

    counts = defaultdict(int)
    wsum = defaultdict(float)
    n = 0
    bad_rows = 0

    with open(args.csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            label = (row.get("label") or "").strip().lower()
            if label not in VALID:
                bad_rows += 1
                continue
            try:
                conf = max(0.0, min(1.0, float(row.get("confidence", 0.5))))
            except (TypeError, ValueError):
                conf = 0.5
            counts[label] += 1
            wsum[label] += conf
            n += 1

    if n == 0:
        print("No valid classified posts — cannot produce a read. "
              "Report this as a coverage gap, do not infer sentiment.")
        sys.exit(2)

    def pct(k):
        return round(100 * counts[k] / n)

    tilt = (wsum["bullish"] - wsum["bearish"]) / n
    if tilt > 0.15:
        verdict = "bullish"
    elif tilt < -0.15:
        verdict = "bearish"
    else:
        verdict = "mixed/neutral"

    confidence = "low" if n < 25 else ("low-med" if n < 100 else "med")

    print(f"Usable posts (n): {n}   (skipped malformed rows: {bad_rows})")
    print(f"Distribution: bull {pct('bullish')}%  bear {pct('bearish')}%  "
          f"neutral {pct('neutral')}%  news {pct('factual-news')}%")
    print(f"Confidence-weighted net tilt: {tilt:+.3f}  ->  {verdict}")
    print(f"Sample-size confidence: {confidence}")

    if args.baseline and args.baseline > 0:
        mult = n / args.baseline
        spike = "  ⚠ VOLUME SPIKE (>3x)" if mult > 3 else ""
        print(f"Volume vs baseline ({args.baseline:g}): {mult:.2f}x{spike}")
    else:
        print("Volume vs baseline: no baseline provided (first run?)")

    print("\nNote: spike = attention, not direction. This is one noisy input; "
          "the analyst corroborates against filings/clinical/price data.")


if __name__ == "__main__":
    main()
