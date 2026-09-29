#!/usr/bin/env python3
"""Estimated cost of a Kie AI payload, in credits, USD and EUR. Local and free.

    estimate.py <payload.json>

Prices come from ../pricing.json (format described in SKILL.md). This script holds no
prices: adding a model means adding an entry to that file.

Exit 0: cost estimated. Exit 2: model or parameter combination without a price.
"""

import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PRICING = HERE.parent / "pricing.json"
ROOT = HERE.parents[3]

FALSY = (None, False, "", "false", "0", [], {})


def matches(value, expected):
    """A boolean condition tests presence; any other tests equality."""
    if isinstance(expected, bool):
        return (value not in FALSY) == expected
    if isinstance(expected, str):
        return str(value).lower() == expected.lower()
    return value == expected


def estimate(payload, pricing):
    """Returns (credits | None, detail)."""
    model = str(payload.get("model") or "")
    entry = pricing["models"].get(model)
    if entry is None:
        return None, f'model "{model or "?"}" missing from pricing.json'

    inp = payload.get("input") or {}
    # A missing field takes the declared default: the schema's, or the worst case when
    # the service's default is unknown.
    values = {**entry.get("defaults", {}),
              **{k: v for k, v in inp.items() if v is not None}}

    rule = next((r for r in entry["rates"]
                 if all(matches(values.get(k), v) for k, v in r["when"].items())), None)
    if rule is None:
        return None, f"{model}: no price for these parameters"
    rate = rule["credits"]
    params = ", ".join(f"{k}={values.get(k)}" for k in rule["when"])
    source = f" — price read on {entry.get('checked', '?')} ({entry.get('source', '?')})"

    if entry["unit"] == "call":
        return rate, f"{model}, {rate} cr per call ({params}){source}"

    if entry["unit"] == "second":
        duration = float(values.get("duration") or 0)
        # Multi-shot: the billed duration is the sum of the shots.
        shots = inp.get(entry.get("shots") or "")
        if isinstance(shots, list) and shots:
            duration = max(duration, sum(float(s.get("duration", 0)) for s in shots))
        if duration <= 0:
            return None, f"{model}: unknown duration"
        credits = math.ceil(rate * duration)
        return credits, f"{model}, {duration:g} s × {rate} cr/s ({params}){source}"

    return None, f'{model}: unknown unit "{entry["unit"]}"'


def usd_to_eur():
    try:
        src = (ROOT / "src/lib/currency.ts").read_text()
        return float(re.search(r"\bUSD:\s*([\d.]+)", src).group(1))
    except Exception:
        return None


def money(credits, usd_per_credit):
    usd = credits * usd_per_credit
    rate = usd_to_eur()
    eur = f" ≈ €{usd * rate:.2f}" if rate else ""
    return f"{credits} credits (${usd:.2f}{eur})"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__.strip(), file=sys.stderr)
        sys.exit(64)
    pricing = json.loads(PRICING.read_text())
    credits, detail = estimate(json.loads(Path(sys.argv[1]).read_text()), pricing)
    if credits is None:
        print(f"Cost not estimable — {detail}. Look up the price and add it to "
              f"pricing.json (see SKILL.md).")
        sys.exit(2)
    print(f"Estimated cost: {money(credits, pricing['usd_per_credit'])} — {detail}.")
