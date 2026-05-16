"""Shared HTTP session, rate limiting, progress reporting, and small helpers."""

import json
import re
import sys
import time

import requests

from . import config

_session = None
_last_request_at = 0.0


def get_session():
    global _session
    if _session is None:
        s = requests.Session()
        s.headers.update(
            {
                "User-Agent": config.USER_AGENT,
                "Accept-Encoding": "gzip, deflate",
            }
        )
        _session = s
    return _session


def _throttle():
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < config.REQUEST_DELAY_SEC:
        time.sleep(config.REQUEST_DELAY_SEC - elapsed)
    _last_request_at = time.time()


def request(method, url, *, timeout=None, **kwargs):
    """Rate-limited request with exponential backoff retries.

    Raises requests.RequestException after the final retry fails.
    """
    timeout = timeout or config.HTTP_TIMEOUT
    last_exc = None
    for attempt in range(config.HTTP_RETRIES):
        _throttle()
        try:
            resp = get_session().request(method, url, timeout=timeout, **kwargs)
            # Retry transient server / throttling responses.
            if resp.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"HTTP {resp.status_code}", response=resp)
            return resp
        except requests.RequestException as exc:
            last_exc = exc
            if attempt < config.HTTP_RETRIES - 1:
                time.sleep(2 ** attempt)
    raise last_exc


def get(url, **kwargs):
    return request("GET", url, **kwargs)


def get_json(url, **kwargs):
    resp = get(url, **kwargs)
    resp.raise_for_status()
    return resp.json()


def download(url, dest_path, **kwargs):
    """Stream a URL to disk. Returns (bytes_written, content_type)."""
    resp = get(url, stream=True, **kwargs)
    resp.raise_for_status()
    total = 0
    with open(dest_path, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                fh.write(chunk)
                total += len(chunk)
    return total, resp.headers.get("Content-Type", "")


_slug_re = re.compile(r"[^A-Za-z0-9._-]+")


def slugify(value, max_len=120):
    value = _slug_re.sub("-", str(value)).strip("-._")
    return (value or "file")[:max_len]


def progress(stage, message, **extra):
    """Emit a machine-readable progress line consumed by the Node runner.

    Human-readable logging goes to stderr so stdout stays parseable.
    """
    payload = {"stage": stage, "message": message}
    payload.update(extra)
    sys.stdout.write("@@PROGRESS@@ " + json.dumps(payload) + "\n")
    sys.stdout.flush()
    sys.stderr.write(f"[{stage}] {message}\n")
    sys.stderr.flush()


def result(payload):
    sys.stdout.write("@@RESULT@@ " + json.dumps(payload) + "\n")
    sys.stdout.flush()


def human_size(num):
    num = float(num)
    for unit in ("B", "KB", "MB", "GB"):
        if num < 1024 or unit == "GB":
            if unit == "B":
                return f"{int(num)} {unit}"
            return f"{num:.1f} {unit}"
        num /= 1024.0
    return f"{num:.1f} GB"
