"""
Pitch sequencing simulation service.
Given a pitcher, batter, count, and at-bat history, returns ranked pitch recommendations
with run value, whiff rate, chase rate, called strike rate, and contact quality.
"""
from dataclasses import dataclass
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models.database import PitchAggregate

PITCH_FAMILIES = {
    'FF': 'fastball', 'SI': 'fastball', 'FC': 'fastball', 'FA': 'fastball',
    'SL': 'breaking', 'ST': 'breaking', 'CU': 'breaking', 'KC': 'breaking', 'SV': 'breaking',
    'CH': 'offspeed', 'FS': 'offspeed',
}

# Pitches that look similar out of the hand (share release point / shape early)
TUNNEL_PAIRS: dict[str, list[str]] = {
    'FF': ['FC', 'SI', 'CH'],
    'FC': ['FF', 'SL'],
    'SI': ['FF', 'CH', 'FS'],
    'SL': ['FC', 'ST'],
    'ST': ['SL', 'CU'],
    'CU': ['ST', 'KC'],
    'CH': ['FF', 'SI'],
    'FS': ['SI', 'CH'],
    'KC': ['CU'],
}

# Score modifiers based on result of previous pitch
# Values are additive score bumps/penalties
RESULT_MODIFIERS: dict[str, dict[str, float]] = {
    'swing_miss': {
        # Batter was fooled — come back or tunnel off it
        'same_family': +0.06,
        'tunnel':      +0.03,
        'contrasting': -0.02,
    },
    'weak_foul': {
        # Batter was late — slightly exploitable, can repeat
        'same_family': +0.04,
        'tunnel':      +0.02,
        'contrasting': +0.00,
    },
    'hard_foul': {
        # Batter squared it up — CHANGE something
        'same_family': -0.09,
        'tunnel':      +0.03,
        'contrasting': +0.05,
    },
    'called_strike': {
        # Batter not protecting — can expand zone
        'same_family': +0.01,
        'tunnel':      +0.01,
        'contrasting': +0.02,
    },
    'ball': {
        # Need a strike — favor reliable in-zone pitches
        'same_family': -0.01,
        'tunnel':       0.00,
        'contrasting': -0.01,
    },
}


def _result_modifier(prev_pitch_type: str, candidate_pitch_type: str, result: str) -> float:
    mods = RESULT_MODIFIERS.get(result)
    if not mods:
        return 0.0
    prev_family = PITCH_FAMILIES.get(prev_pitch_type)
    cand_family = PITCH_FAMILIES.get(candidate_pitch_type)
    tunnels = TUNNEL_PAIRS.get(prev_pitch_type, [])

    if candidate_pitch_type in tunnels:
        return mods.get('tunnel', 0.0)
    if prev_family and cand_family and prev_family == cand_family:
        return mods.get('same_family', 0.0)
    return mods.get('contrasting', 0.0)


PITCH_TYPE_LABELS = {
    "FF": "4-Seam Fastball",
    "SI": "Sinker",
    "FC": "Cutter",
    "SL": "Slider",
    "ST": "Sweeper",
    "CU": "Curveball",
    "KC": "Knuckle Curve",
    "CH": "Changeup",
    "FS": "Splitter",
    "FA": "Fastball",
    "SV": "Slurve",
    "EP": "Eephus",
    "KN": "Knuckleball",
}

ZONE_LABELS = {
    1: "Up-In", 2: "Up-Middle", 3: "Up-Away",
    4: "Middle-In", 5: "Heart", 6: "Middle-Away",
    7: "Down-In", 8: "Down-Middle", 9: "Down-Away",
    11: "Chase-In", 12: "Chase-Away", 13: "Chase-Up", 14: "Chase-Down",
}


# ── Count leverage weight tables ───────────────────────────────────────────────
# Each count maps to (run_value, whiff, called_strike, chase, contact_quality).
# Weights sum to 1.0.
#
# Hitter's counts (2-0, 3-0, 3-1): run value dominates — getting a strike matters most.
# Early ahead/behind (0-1, 1-0):   balanced, slightly favor called strike setup.
# Even counts (1-1, 2-1):          neutral blend.
# Pitcher's counts (0-2, 1-2):     hunt the swing and miss.
# Two-strike (2-2):                 strikeout pitch, can work shadow zone.
# Full count (3-2):                 binary outcome — chase jumps, called strike irrelevant.
# 0-0:                              first pitch — run value and called strike set the tone.

COUNT_WEIGHTS: dict[tuple[int, int], tuple[float, float, float, float, float]] = {
    #              rv      whiff   csw     chase   contact
    (0, 0): (0.40,  0.20,  0.15,  0.05,  0.20),   # first pitch
    (0, 1): (0.35,  0.275, 0.175, 0.10,  0.10),   # early ahead
    (1, 0): (0.35,  0.275, 0.175, 0.05,  0.15),   # early behind
    (1, 1): (0.35,  0.275, 0.175, 0.10,  0.10),   # even
    (2, 0): (0.42,  0.18,  0.15,  0.05,  0.20),   # hitter's count
    (2, 1): (0.375, 0.25,  0.125, 0.10,  0.15),   # even, slight hitter lean
    (3, 0): (0.50,  0.10,  0.20,  0.00,  0.20),   # must throw strike — chase irrelevant
    (3, 1): (0.45,  0.15,  0.15,  0.025, 0.225),  # hitter's count
    (0, 2): (0.20,  0.40,  0.05,  0.25,  0.10),   # pitcher's count
    (1, 2): (0.225, 0.40,  0.05,  0.225, 0.10),   # pitcher's count
    (2, 2): (0.30,  0.30,  0.10,  0.20,  0.10),   # two-strike
    (3, 2): (0.35,  0.25,  0.15,  0.10,  0.15),   # full count
}

COUNT_CATEGORY: dict[tuple[int, int], str] = {
    (0, 0): "first_pitch",
    (0, 1): "early_ahead",
    (1, 0): "early_behind",
    (1, 1): "even",
    (2, 0): "hitters_count",
    (2, 1): "even",
    (3, 0): "hitters_count",
    (3, 1): "hitters_count",
    (0, 2): "pitchers_count",
    (1, 2): "pitchers_count",
    (2, 2): "two_strike",
    (3, 2): "full_count",
}


@dataclass
class ZoneRecommendation:
    zone: int
    zone_label: str
    pitch_count: int
    whiff_rate: Optional[float]
    chase_rate: Optional[float]
    called_strike_rate: Optional[float]
    avg_run_value: Optional[float]
    avg_xwoba: Optional[float]
    score: float


@dataclass
class PitchRecommendation:
    pitch_type: str
    pitch_label: str
    total_pitches: int
    avg_run_value: Optional[float]
    whiff_rate: Optional[float]
    chase_rate: Optional[float]
    avg_xwoba: Optional[float]
    avg_pfx_x: Optional[float]
    avg_pfx_z: Optional[float]
    zones: list[ZoneRecommendation]
    best_zone: Optional[ZoneRecommendation]
    score: float
    base_score: float
    h2h_modifier: float
    result_modifier: float
    movement_modifier: float
    score_components: dict[str, float]
    count_category: str
    weights_used: dict[str, float]


def _score(
    avg_run_value: Optional[float],
    whiff_rate: Optional[float],
    called_strike_rate: Optional[float],
    chase_rate: Optional[float],
    avg_xwoba: Optional[float],
    weights: tuple[float, float, float, float, float],
) -> tuple[float, dict]:
    """
    Returns (total_score, component_contributions).
    run_value is negated so that more negative (better for pitcher) = higher score.
    xwOBA is negated so that lower contact quality = higher score.
    """
    w_rv, w_whiff, w_csw, w_chase, w_contact = weights

    rv_score      = -(avg_run_value or 0) * w_rv
    whiff_score   = (whiff_rate or 0) * w_whiff
    csw_score     = (called_strike_rate or 0) * w_csw
    chase_score   = (chase_rate or 0) * w_chase
    contact_score = (0.500 - (avg_xwoba or 0.320)) * w_contact if avg_xwoba is not None else 0.0

    total = rv_score + whiff_score + csw_score + chase_score + contact_score
    components = {
        "run_value":      round(rv_score, 4),
        "whiff":          round(whiff_score, 4),
        "called_strike":  round(csw_score, 4),
        "chase":          round(chase_score, 4),
        "contact_quality":round(contact_score, 4),
    }
    return total, components


def get_recommendations(
    db: Session,
    pitcher_id: int,
    batter_id: int,
    balls: int,
    strikes: int,
    stand: str,
    prev_pitch_type: Optional[str] = None,
    prev_pitch_result: Optional[str] = None,
    use_matchup_data: bool = True,
    h2h_modifiers: Optional[dict[str, float]] = None,
    movement_modifiers: Optional[dict[str, float]] = None,
) -> list[PitchRecommendation]:
    """
    Return ranked pitch type + location recommendations for the current situation.
    Falls back to pitcher-level aggregates when matchup sample is too small.
    """
    weights = COUNT_WEIGHTS.get((balls, strikes), COUNT_WEIGHTS[(0, 0)])
    count_category = COUNT_CATEGORY.get((balls, strikes), "even")
    weights_dict = {
        "run_value": weights[0],
        "whiff_rate": weights[1],
        "called_strike_rate": weights[2],
        "chase_rate": weights[3],
        "contact_quality": weights[4],
    }

    query = db.query(PitchAggregate).filter(
        PitchAggregate.pitcher_id == pitcher_id,
        PitchAggregate.balls == balls,
        PitchAggregate.strikes == strikes,
        PitchAggregate.stand == stand,
    )

    matchup_rows = []
    if use_matchup_data:
        matchup_rows = query.filter(PitchAggregate.batter_id == batter_id).all()

    if len(matchup_rows) < 10:
        rows = query.filter(PitchAggregate.batter_id == None).all()  # noqa: E711
    else:
        rows = matchup_rows

    # If still no data for this exact count, fall back to all counts for this pitcher
    # and weight by proximity to the requested count (same strike count preferred)
    if not rows:
        rows = (
            db.query(PitchAggregate)
            .filter(
                PitchAggregate.pitcher_id == pitcher_id,
                PitchAggregate.batter_id == None,  # noqa: E711
                PitchAggregate.strikes == strikes,  # keep same strike count
                PitchAggregate.stand == stand,
            )
            .all()
        )

    # Last resort: any count for this pitcher/stand
    if not rows:
        rows = (
            db.query(PitchAggregate)
            .filter(
                PitchAggregate.pitcher_id == pitcher_id,
                PitchAggregate.batter_id == None,  # noqa: E711
                PitchAggregate.stand == stand,
            )
            .all()
        )

    if prev_pitch_type:
        seq_rows = [r for r in rows if r.prev_pitch_type == prev_pitch_type]
        if len(seq_rows) >= 3:
            rows = seq_rows

    if not rows:
        return []

    df = pd.DataFrame([{
        "pitch_type": r.pitch_type,
        "zone": r.zone,
        "pitch_count": r.pitch_count,
        "whiff_rate": r.whiff_rate,
        "chase_rate": r.chase_rate,
        "called_strike_rate": r.called_strike_rate,
        "avg_run_value": r.avg_run_value,
        "avg_xwoba": r.avg_xwoba,
        "avg_pfx_x": getattr(r, "avg_pfx_x", None),
        "avg_pfx_z": getattr(r, "avg_pfx_z", None),
    } for r in rows])

    recommendations = []
    for pitch_type, grp in df.groupby("pitch_type"):
        total = grp["pitch_count"].sum()
        avg_rv    = grp["avg_run_value"].mean() if grp["avg_run_value"].notna().any() else None
        avg_whiff = grp["whiff_rate"].mean() if grp["whiff_rate"].notna().any() else None
        avg_chase = grp["chase_rate"].mean() if grp["chase_rate"].notna().any() else None
        avg_csw   = grp["called_strike_rate"].mean() if grp["called_strike_rate"].notna().any() else None
        avg_xwoba = grp["avg_xwoba"].mean() if grp["avg_xwoba"].notna().any() else None
        avg_pfx_x = grp["avg_pfx_x"].mean() if "avg_pfx_x" in grp.columns and grp["avg_pfx_x"].notna().any() else None
        avg_pfx_z = grp["avg_pfx_z"].mean() if "avg_pfx_z" in grp.columns and grp["avg_pfx_z"].notna().any() else None

        zones = []
        for _, row in grp.iterrows():
            z_score, _ = _score(
                row.get("avg_run_value"), row.get("whiff_rate"),
                row.get("called_strike_rate"), row.get("chase_rate"),
                row.get("avg_xwoba"), weights,
            )
            zones.append(ZoneRecommendation(
                zone=int(row["zone"]),
                zone_label=ZONE_LABELS.get(int(row["zone"]), str(row["zone"])),
                pitch_count=int(row["pitch_count"]),
                whiff_rate=row.get("whiff_rate"),
                chase_rate=row.get("chase_rate"),
                called_strike_rate=row.get("called_strike_rate"),
                avg_run_value=row.get("avg_run_value"),
                avg_xwoba=row.get("avg_xwoba"),
                score=z_score,
            ))
        zones.sort(key=lambda z: z.score, reverse=True)

        base_score, components = _score(avg_rv, avg_whiff, avg_csw, avg_chase, avg_xwoba, weights)
        h2h_mod = (h2h_modifiers or {}).get(pitch_type, 0.0)
        result_mod = (
            _result_modifier(prev_pitch_type, pitch_type, prev_pitch_result)
            if prev_pitch_type and prev_pitch_result else 0.0
        )
        mov_mod = (movement_modifiers or {}).get(pitch_type, 0.0)
        final_score = base_score + h2h_mod + result_mod + mov_mod
        recommendations.append(PitchRecommendation(
            pitch_type=pitch_type,
            pitch_label=PITCH_TYPE_LABELS.get(pitch_type, pitch_type),
            total_pitches=int(total),
            avg_run_value=avg_rv,
            whiff_rate=avg_whiff,
            chase_rate=avg_chase,
            avg_xwoba=avg_xwoba,
            avg_pfx_x=avg_pfx_x,
            avg_pfx_z=avg_pfx_z,
            zones=zones,
            best_zone=zones[0] if zones else None,
            score=final_score,
            base_score=base_score,
            h2h_modifier=h2h_mod,
            result_modifier=result_mod,
            movement_modifier=mov_mod,
            score_components=components,
            count_category=count_category,
            weights_used=weights_dict,
        ))

    recommendations.sort(key=lambda r: r.score, reverse=True)
    return recommendations
