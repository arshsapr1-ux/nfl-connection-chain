#!/usr/bin/env python3
"""Download the nflverse source files into data/raw/ (one-time, offline step).

Resumable: files already on disk are skipped. Failed downloads are retried with
exponential backoff and written atomically, so a partial file is never cached.

Usage: python3 scripts/data/fetch_nflverse.py
"""
import os
import ssl
import sys
import time
import urllib.request

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
UA = "NFLChainGame-DataFetch/1.0 (personal hobby project)"
FIRST_SEASON, LAST_SEASON = 1920, 2026
FIRST_WEEKLY = 2002

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "data", "raw")

# python.org macOS builds ship without system CA certs; prefer certifi when present.
try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CTX = ssl.create_default_context()


def targets():
    yield f"{BASE}/players/players.csv", "players.csv"
    for y in range(FIRST_SEASON, LAST_SEASON + 1):
        yield f"{BASE}/rosters/roster_{y}.csv", f"roster_{y}.csv"
    for y in range(FIRST_WEEKLY, LAST_SEASON + 1):
        yield f"{BASE}/weekly_rosters/roster_weekly_{y}.csv", f"roster_weekly_{y}.csv"


def download(url, dest, attempts=5):
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
                data = resp.read()
            tmp = dest + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, dest)
            return True
        except Exception as e:  # network errors, 429, 5xx
            wait = 2 ** (i + 1)
            print(f"  error ({e}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    return False


def main():
    os.makedirs(RAW, exist_ok=True)
    failed = []
    for url, name in targets():
        dest = os.path.join(RAW, name)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            continue
        print(f"fetch {name}", flush=True)
        if not download(url, dest):
            failed.append(name)
        time.sleep(0.5)  # be polite to GitHub
    if failed:
        print(f"FAILED: {failed} — re-run to resume", file=sys.stderr)
        sys.exit(1)
    print("all files present")


if __name__ == "__main__":
    main()
