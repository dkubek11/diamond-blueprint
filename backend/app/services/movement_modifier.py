"""
Movement-based pitch modifier.

For each pitch type, computes how well this PITCHER'S specific movement profile
exploits THIS batter's vulnerabilities.

Logic:
  1. Get pitcher's avg pfx_x / pfx_z for this pitch type (movement fingerprint)
  2. Find all pitches this batter has faced of this type with similar movement
  3. Compare batter's whiff rate + xwOBA in that movement window vs. their
     overall rate against this pitch type
  4. Return an additive modifier bounded to [-0.08, +0.08]

Positive = this pitcher's movement on this pitch is a specific problem for this batter.
Negative = batter actually handles this movement shape well.
"""

import time
from typing import Optional

from sqlalchemy.orm import Session

from app.models.database import Pitch, SessionLocal

MOVEMENT_WEIGHT = 0.35     # scale raw advantage → score modifier
MAX_MOD = 0.08

# Movement similarity window (Statcast pfx values are in feet)
TOL_X = 0.25               # ±3 inches horizontal
TOL_Z = 0.17               # ±2 inches vertical

MIN_PITCHER_SAMPLE = 10    # min pitches to trust pitcher's movement profile
MIN_BATTER_SAMPLE = 5      # min pitches in movement window to compute modifier

WHIFF_DESCS = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}

# Cache: (pitcher_id, batter_id) → (timestamp, {pitch_type: modifier})
_cache: dict[tuple, tuple] = {}
CACHE_TTL = 3600


def compute_movement_modifiers(
    pitcher_id: int,
    batter_id: int,
    db: Optional[Session] = None,
) -> dict[str, float]:
    """
    Returns {pitch_type: movement_modifier} for all pitch types this pitcher throws.
    Positive = pitcher's movement shape exploits this batter.
    """
    key = (pitcher_id, batter_id)
    now = time.time()
    if key in _cache and now - _cache[key][0] < CACHE_TTL:
        return _cache[key][1]

    close = db is None
    if db is None:
        db = SessionLocal()

    try:
        result = _compute(pitcher_id, batter_id, db)
    finally:
        if close:
            db.close()

    _cache[key] = (now, result)
    return result


def _compute(pitcher_id: int, batter_id: int, db: Session) -> dict[str, float]:
    # Pull all pitcher pitches with movement data
    pitcher_rows = (
        db.query(Pitch.pitch_type, Pitch.pfx_x, Pitch.pfx_z)
        .filter(
            Pitch.pitcher_id == pitcher_id,
            Pitch.pfx_x.isnot(None),
            Pitch.pfx_z.isnot(None),
            Pitch.pitch_type.isnot(None),
        )
        .all()
    )

    if not pitcher_rows:
        return {}

    # Group pitcher pitches by type and compute avg movement
    from collections import defaultdict
    pitcher_by_type: dict[str, list] = defaultdict(list)
    for row in pitcher_rows:
        pitcher_by_type[row.pitch_type].append((row.pfx_x, row.pfx_z))

    # Pull all batter pitches (we'll filter in Python to avoid too many DB queries)
    batter_rows = (
        db.query(
            Pitch.pitch_type, Pitch.pfx_x, Pitch.pfx_z,
            Pitch.description, Pitch.estimated_woba_using_speedangle,
        )
        .filter(
            Pitch.batter_id == batter_id,
            Pitch.pitch_type.isnot(None),
        )
        .all()
    )

    # Group batter pitches by type
    batter_by_type: dict[str, list] = defaultdict(list)
    for row in batter_rows:
        batter_by_type[row.pitch_type].append(row)

    modifiers: dict[str, float] = {}

    for pitch_type, pitcher_pitches in pitcher_by_type.items():
        if len(pitcher_pitches) < MIN_PITCHER_SAMPLE:
            continue

        # Pitcher's movement fingerprint for this pitch type
        avg_pfx_x = sum(p[0] for p in pitcher_pitches) / len(pitcher_pitches)
        avg_pfx_z = sum(p[1] for p in pitcher_pitches) / len(pitcher_pitches)

        batter_pitches_of_type = batter_by_type.get(pitch_type, [])
        if not batter_pitches_of_type:
            continue

        # Batter's OVERALL stats vs this pitch type
        overall_whiff_rate = _whiff_rate(batter_pitches_of_type)
        overall_xwoba = _avg_xwoba(batter_pitches_of_type)

        # Batter's stats vs pitches matching the pitcher's movement window
        movement_matched = [
            r for r in batter_pitches_of_type
            if r.pfx_x is not None and r.pfx_z is not None
            and abs(r.pfx_x - avg_pfx_x) <= TOL_X
            and abs(r.pfx_z - avg_pfx_z) <= TOL_Z
        ]

        if len(movement_matched) < MIN_BATTER_SAMPLE:
            continue

        matched_whiff_rate = _whiff_rate(movement_matched)
        matched_xwoba = _avg_xwoba(movement_matched)

        # Advantage: how much MORE batter struggles against this movement vs. baseline
        whiff_adv = matched_whiff_rate - overall_whiff_rate  # positive = batter struggles more

        if overall_xwoba is not None and matched_xwoba is not None:
            # lower xwoba = better for pitcher → positive advantage
            contact_adv = overall_xwoba - matched_xwoba
        else:
            contact_adv = 0.0

        raw = whiff_adv * 0.6 + contact_adv * 0.4
        modifier = max(-MAX_MOD, min(MAX_MOD, raw * MOVEMENT_WEIGHT))
        modifiers[pitch_type] = round(modifier, 4)

    return modifiers


def _whiff_rate(pitches) -> float:
    if not pitches:
        return 0.0
    whiffs = sum(1 for p in pitches if (p.description or '') in WHIFF_DESCS)
    return whiffs / len(pitches)


def _avg_xwoba(pitches) -> Optional[float]:
    vals = [p.estimated_woba_using_speedangle for p in pitches
            if p.estimated_woba_using_speedangle is not None]
    return sum(vals) / len(vals) if vals else None
