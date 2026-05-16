"""CLI entrypoint:  python -m dossier TICKER [--out DIR] [--cik N] [--ir URL]

Designed to be spawned by the Node server, but also runnable standalone.
Progress is streamed to stdout as `@@PROGRESS@@ {json}` lines and the final
result as `@@RESULT@@ {json}`; human logs go to stderr.
"""

import argparse
import os
import sys
import traceback

from . import pipeline, util

DEFAULT_OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dossiers"
)


def main(argv=None):
    parser = argparse.ArgumentParser(prog="dossier")
    parser.add_argument("ticker", help="Stock ticker, e.g. ABBV")
    parser.add_argument("--out", default=DEFAULT_OUT,
                        help="Output root directory (default: ./dossiers)")
    parser.add_argument("--cik", type=int, default=None,
                        help="CIK override for very recent listings")
    parser.add_argument("--name", default=None,
                        help="Company name override (used with --cik)")
    parser.add_argument("--ir", default=None,
                        help="Seed investor-relations URL override")
    parser.add_argument("--no-clean", action="store_true",
                        help="Do not wipe an existing folder for the ticker")
    args = parser.parse_args(argv)

    overrides = {}
    t = args.ticker.upper().strip()
    if args.cik:
        overrides[t] = {"cik": args.cik, "name": args.name or t}
    if args.ir:
        overrides.setdefault(t, {})["irUrl"] = args.ir

    try:
        pipeline.run(t, args.out, overrides=overrides or None,
                     clean=not args.no_clean)
        return 0
    except Exception as exc:  # noqa: BLE001
        util.progress("error", f"Dossier failed: {exc}")
        traceback.print_exc(file=sys.stderr)
        util.result({"error": str(exc), "ticker": t})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
