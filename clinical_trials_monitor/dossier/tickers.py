"""Resolve a stock ticker to an SEC CIK number and company name.

Order of resolution:
  1. Live SEC company_tickers.json (authoritative, always current).
  2. Bundled server/sec_tickers.json snapshot (offline fallback).
  3. Caller-supplied override map (handles brand-new issuers).
"""

import json
import os

from . import config, util


def _index_rows(rows):
    out = {}
    for row in rows:
        ticker = str(row.get("ticker", "")).upper().strip()
        cik = row.get("cik_str")
        if ticker and cik is not None:
            out[ticker] = {
                "cik": int(cik),
                "name": row.get("title") or row.get("name") or ticker,
            }
    return out


def _from_live():
    data = util.get_json(config.SEC_TICKERS_URL)
    return _index_rows(data.values())


def _from_bundled():
    if not os.path.exists(config.BUNDLED_TICKERS):
        return {}
    with open(config.BUNDLED_TICKERS, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return _index_rows(data.values())


def resolve(ticker, overrides=None):
    """Return {'ticker', 'cik', 'cik10', 'name', 'source'} or raise ValueError."""
    ticker = ticker.upper().strip()

    if overrides and ticker in overrides:
        entry = overrides[ticker]
        cik = int(entry["cik"])
        return {
            "ticker": ticker,
            "cik": cik,
            "cik10": f"{cik:010d}",
            "name": entry.get("name", ticker),
            "source": "override",
        }

    source = "live SEC company_tickers.json"
    try:
        table = _from_live()
    except Exception:
        table = {}

    if ticker not in table:
        source = "bundled sec_tickers.json"
        table = _from_bundled()

    if ticker not in table:
        raise ValueError(
            f"Ticker '{ticker}' not found in SEC ticker tables. "
            f"If it is a very recent listing, supply a CIK override."
        )

    entry = table[ticker]
    return {
        "ticker": ticker,
        "cik": entry["cik"],
        "cik10": f"{entry['cik']:010d}",
        "name": entry["name"],
        "source": source,
    }
