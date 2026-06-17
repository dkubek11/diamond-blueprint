"""
H2H modifier: fetches historical batter-vs-pitcher pitch data from Baseball Savant
and computes per-pitch-type score adjustments based on observed whiff rate and
contact quality against this specific pitcher.

Modifier is bounded to [-0.12, +0.12] so it nudges rankings without overriding
the main Statcast aggregate signal.
"""
import io
import csv
import time
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

LEAGUE_AVG_WHIFF = 0.245
LEAGUE_AVG_XWOBA = 0.320
MIN_PITCHES = 5          # minimum pitches seen of a type to apply modifier
MAX_MODIFIER = 0.12      # caps how much H2H can shift the score
H2H_WEIGHT   = 0.40      # how much weight H2H whiff advantage carries

# Simple in-memory cache: (pitcher_id, batter_id) → (timestamp, data)
_cache: dict = {}
CACHE_TTL = 3600  # 1 hour

WHIFF_DESCS = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
CONTACT_DESCS = {"hit_into_play", "hit_into_play_no_out", "hit_into_play_score"}
SWING_DESCS = WHIFF_DESCS | {"foul", "hit_into_play", "hit_into_play_no_out", "hit_into_play_score"}


def _fetch_h2h_pitches(pitcher_id: int, batter_id: int) -> list[dict]:
    key = (pitcher_id, batter_id)
    now = time.time()
    if key in _cache and now - _cache[key][0] < CACHE_TTL:
        return _cache[key][1]

    from datetime import date
    current_year = date.today().year
    seasons = "%7C".join(str(y) for y in range(2015, current_year + 1)) + "%7C"
    url = (
        "https://baseballsavant.mlb.com/statcast_search/csv"
        f"?all=true&player_type=pitcher"
        f"&pitchers_lookup%5B%5D={pitcher_id}"
        f"&batters_lookup%5B%5D={batter_id}"
        f"&hfSea={seasons}&hfGT=R%7C"
        f"&type=details&min_pitches=0&min_results=0&min_abs=0"
    )
    try:
        resp = httpx.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        text = resp.content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = [r for r in reader if r.get("pitch_type")]
        _cache[key] = (now, rows)
        logger.info(f"H2H fetched {len(rows)} pitches for {pitcher_id} vs {batter_id}")
        return rows
    except Exception as e:
        logger.warning(f"H2H fetch failed: {e}")
        _cache[key] = (now, [])
        return []


def compute_h2h_modifiers(pitcher_id: int, batter_id: int) -> dict[str, float]:
    """
    Returns {pitch_type: modifier} where positive = pitcher has historical advantage
    with this pitch vs this batter, negative = batter handles it well.
    """
    rows = _fetch_h2h_pitches(pitcher_id, batter_id)
    if not rows:
        return {}

    from collections import defaultdict
    by_type: dict = defaultdict(lambda: {"pitches": 0, "swings": 0, "whiffs": 0, "xwoba_vals": []})

    for r in rows:
        pt = r.get("pitch_type", "").strip()
        if not pt:
            continue
        desc = r.get("description", "").strip()
        xwoba = r.get("estimated_woba_using_speedangle", "")

        by_type[pt]["pitches"] += 1
        if desc in SWING_DESCS:
            by_type[pt]["swings"] += 1
        if desc in WHIFF_DESCS:
            by_type[pt]["whiffs"] += 1
        if xwoba:
            try:
                by_type[pt]["xwoba_vals"].append(float(xwoba))
            except ValueError:
                pass

    modifiers: dict[str, float] = {}
    for pt, data in by_type.items():
        if data["pitches"] < MIN_PITCHES:
            continue

        swings = data["swings"]
        whiffs = data["whiffs"]
        h2h_whiff = whiffs / swings if swings > 0 else None
        xwoba_vals = data["xwoba_vals"]
        h2h_xwoba = sum(xwoba_vals) / len(xwoba_vals) if xwoba_vals else None

        # Whiff advantage: positive if pitcher gets more whiffs than league avg
        whiff_adv = (h2h_whiff - LEAGUE_AVG_WHIFF) if h2h_whiff is not None else 0.0

        # Contact quality advantage: positive if batter hits it poorly (low xwOBA)
        contact_adv = (LEAGUE_AVG_XWOBA - h2h_xwoba) if h2h_xwoba is not None else 0.0

        raw = (whiff_adv * 0.6 + contact_adv * 0.4) * H2H_WEIGHT
        modifiers[pt] = max(-MAX_MODIFIER, min(MAX_MODIFIER, raw))

    return modifiers
