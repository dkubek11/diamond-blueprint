"""
Hitter profile service.
Computes recent splits (last 7/30 days), hot/cold zones (last 15 days),
and pitch vulnerability from raw pitch data.
"""
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models.database import Pitch

LEAGUE_AVG_XWOBA = 0.320
LEAGUE_AVG_K_PCT = 0.228
LEAGUE_AVG_BB_PCT = 0.085

IN_ZONE_IDS = {1, 2, 3, 4, 5, 6, 7, 8, 9}

PITCH_TYPE_LABELS = {
    "FF": "4-Seam Fastball", "SI": "Sinker", "FC": "Cutter",
    "SL": "Slider", "ST": "Sweeper", "CU": "Curveball",
    "KC": "Knuckle Curve", "CH": "Changeup", "FS": "Splitter",
}

WHIFF_DESCS = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
STRIKEOUT_EVENTS = {"strikeout", "strikeout_double_play"}
WALK_EVENTS = {"walk", "intent_walk", "hit_by_pitch"}
HIT_EVENTS = {"single", "double", "triple", "home_run"}
AB_EVENTS = {"single", "double", "triple", "home_run", "field_out", "strikeout",
             "strikeout_double_play", "grounded_into_double_play", "force_out",
             "double_play", "fielders_choice", "fielders_choice_out", "field_error"}

def _coords_to_zone(plate_x, plate_z) -> Optional[int]:
    if plate_x is None or plate_z is None:
        return None
    x, z = plate_x, plate_z
    sz_left, sz_right = -0.83, 0.83
    sz_bot, sz_top = 1.5, 3.5
    x_thirds = [sz_left + i * (sz_right - sz_left) / 3 for i in range(4)]
    z_thirds = [sz_top - i * (sz_top - sz_bot) / 3 for i in range(4)]
    in_x = sz_left <= x <= sz_right
    in_z = sz_bot <= z <= sz_top
    if in_x and in_z:
        col = next(i for i in range(3) if x_thirds[i] <= x <= x_thirds[i + 1]) + 1
        row = next(i for i in range(3) if z_thirds[i + 1] <= z <= z_thirds[i])
        return row * 3 + col
    if (sz_left - 0.33) <= x <= (sz_right + 0.33) and (sz_bot - 0.5) <= z <= (sz_top + 0.5):
        if x < sz_left: return 11
        if x > sz_right: return 12
        if z > sz_top: return 13
        return 14
    return 14


def _last_n_game_dates(db: Session, batter_id: int, n: int) -> list:
    from sqlalchemy import distinct
    dates = (
        db.query(distinct(Pitch.game_date))
        .filter(Pitch.batter_id == batter_id, Pitch.game_date.isnot(None))
        .order_by(Pitch.game_date.desc())
        .limit(n)
        .all()
    )
    return [d[0] for d in dates]


def _load_batter_pitches(db: Session, batter_id: int, since: date) -> pd.DataFrame:
    rows = (
        db.query(Pitch)
        .filter(Pitch.batter_id == batter_id, Pitch.game_date >= since)
        .all()
    )
    if not rows:
        return pd.DataFrame()

    return pd.DataFrame([{
        "game_date": p.game_date,
        "pitch_type": p.pitch_type,
        "description": p.description,
        "events": p.events,
        "plate_x": p.plate_x,
        "plate_z": p.plate_z,
        "estimated_woba_using_speedangle": p.estimated_woba_using_speedangle,
        "delta_run_exp": p.delta_run_exp,
        "launch_speed": p.launch_speed,
        "bb_type": p.bb_type,
    } for p in rows])


def _compute_splits(df: pd.DataFrame) -> dict:
    if df.empty:
        return {}
    df = df.copy()
    df["is_ab"] = df["events"].isin(AB_EVENTS)
    df["is_hit"] = df["events"].isin(HIT_EVENTS)
    df["is_k"] = df["events"].isin(STRIKEOUT_EVENTS)
    df["is_bb"] = df["events"].isin(WALK_EVENTS)
    df["is_whiff"] = df["description"].isin(WHIFF_DESCS)
    df["is_swing"] = df["description"].isin(
        WHIFF_DESCS | {"hit_into_play", "foul", "foul_tip"}
    )

    ab = df["is_ab"].sum()
    pa = ab + df["is_bb"].sum()
    hits = df["is_hit"].sum()
    ks = df["is_k"].sum()
    bbs = df["is_bb"].sum()
    swings = df["is_swing"].sum()
    whiffs = df["is_whiff"].sum()
    xwoba_vals = df["estimated_woba_using_speedangle"].dropna()

    return {
        "pa": int(pa),
        "avg": round(hits / ab, 3) if ab > 0 else None,
        "k_pct": round(ks / pa, 3) if pa > 0 else None,
        "bb_pct": round(bbs / pa, 3) if pa > 0 else None,
        "whiff_pct": round(whiffs / swings, 3) if swings > 0 else None,
        "xwoba": round(xwoba_vals.mean(), 3) if len(xwoba_vals) > 0 else None,
    }


def _compute_hot_cold_zones(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    df = df.copy()
    df["zone"] = df.apply(lambda r: _coords_to_zone(r["plate_x"], r["plate_z"]), axis=1)
    contact = df[df["estimated_woba_using_speedangle"].notna() & df["zone"].notna()]
    if contact.empty:
        return []

    zones = []
    for zone_id, grp in contact.groupby("zone"):
        n = len(grp)
        if n < 2:
            continue
        xwoba = grp["estimated_woba_using_speedangle"].mean()
        zones.append({
            "zone": int(zone_id),
            "xwoba": round(float(xwoba), 3),
            "n": int(n),
            "vs_avg": round(float(xwoba - LEAGUE_AVG_XWOBA), 3),
        })
    return sorted(zones, key=lambda z: z["xwoba"], reverse=True)


def _compute_pitch_vulnerability(df: pd.DataFrame) -> list[dict]:
    if df.empty:
        return []
    df = df.copy()
    df["is_whiff"] = df["description"].isin(WHIFF_DESCS)
    df["is_swing"] = df["description"].isin(WHIFF_DESCS | {"hit_into_play", "foul", "foul_tip"})
    df["zone"] = df.apply(lambda r: _coords_to_zone(r["plate_x"], r["plate_z"]), axis=1)
    df["in_zone"] = df["zone"].isin(IN_ZONE_IDS)
    df["is_out_of_zone_swing"] = (~df["in_zone"]) & df["description"].isin(WHIFF_DESCS | {"hit_into_play", "foul", "foul_tip"})
    df["is_out_of_zone"] = ~df["in_zone"]
    df["is_batted_ball"] = df["bb_type"].notna()
    df["is_hard_hit"] = df["is_batted_ball"] & (df["launch_speed"] >= 95) & df["launch_speed"].notna()
    df["is_gb"] = df["bb_type"] == "ground_ball"
    contact = df[df["estimated_woba_using_speedangle"].notna()]

    results = []
    for pt, grp in df.groupby("pitch_type"):
        if pd.isna(pt) or len(grp) < 5:
            continue
        swings = grp["is_swing"].sum()
        whiffs = grp["is_whiff"].sum()
        out_of_zone = grp["is_out_of_zone"].sum()
        out_of_zone_swings = grp["is_out_of_zone_swing"].sum()
        batted = grp["is_batted_ball"].sum()
        hard_hits = grp["is_hard_hit"].sum()
        gbs = grp["is_gb"].sum()
        ev_vals = grp["launch_speed"].dropna()
        xwoba_grp = contact[contact["pitch_type"] == pt]["estimated_woba_using_speedangle"]

        results.append({
            "pitch_type": pt,
            "pitch_label": PITCH_TYPE_LABELS.get(pt, pt),
            "pitches_seen": int(len(grp)),
            "whiff_pct": round(whiffs / swings, 3) if swings > 0 else None,
            "chase_pct": round(float(out_of_zone_swings / out_of_zone), 3) if out_of_zone > 0 else None,
            "hard_hit_pct": round(float(hard_hits / batted), 3) if batted > 0 else None,
            "gb_pct": round(float(gbs / batted), 3) if batted > 0 else None,
            "avg_ev": round(float(ev_vals.mean()), 1) if len(ev_vals) > 0 else None,
            "xwoba": round(float(xwoba_grp.mean()), 3) if len(xwoba_grp) > 0 else None,
        })

    return sorted(results, key=lambda x: x.get("xwoba") or 0, reverse=True)


def _load_batter_pitches_by_dates(db: Session, batter_id: int, game_dates: list) -> pd.DataFrame:
    if not game_dates:
        return pd.DataFrame()
    rows = (
        db.query(Pitch)
        .filter(Pitch.batter_id == batter_id, Pitch.game_date.in_(game_dates))
        .all()
    )
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame([{
        "game_date": p.game_date,
        "pitch_type": p.pitch_type,
        "description": p.description,
        "events": p.events,
        "plate_x": p.plate_x,
        "plate_z": p.plate_z,
        "estimated_woba_using_speedangle": p.estimated_woba_using_speedangle,
        "delta_run_exp": p.delta_run_exp,
        "launch_speed": p.launch_speed,
        "bb_type": p.bb_type,
    } for p in rows])


def _compute_pitch_locations(df: pd.DataFrame) -> list[dict]:
    """Raw pitch coordinates with xwoba for KDE heatmap rendering."""
    if df.empty:
        return []
    has_coords = df["plate_x"].notna() & df["plate_z"].notna() & df["estimated_woba_using_speedangle"].notna()
    sub = df[has_coords]
    return [
        {"x": round(float(r.plate_x), 4), "z": round(float(r.plate_z), 4), "xwoba": round(float(r.estimated_woba_using_speedangle), 4)}
        for r in sub.itertuples(index=False)
    ]


def get_hitter_profile(db: Session, batter_id: int) -> dict:
    today = date.today()
    df_30 = _load_batter_pitches(db, batter_id, today - timedelta(days=30))
    df_7  = df_30[df_30["game_date"] >= today - timedelta(days=7)] if not df_30.empty else pd.DataFrame()

    last_20_dates = _last_n_game_dates(db, batter_id, 20)
    df_20g = _load_batter_pitches_by_dates(db, batter_id, last_20_dates)

    return {
        "last_7":  _compute_splits(df_7),
        "last_30": _compute_splits(df_30),
        "hot_cold_zones": _compute_hot_cold_zones(df_20g),
        "pitch_locations": _compute_pitch_locations(df_20g),
        "pitch_vulnerability": _compute_pitch_vulnerability(df_20g),
        "sample_sizes": {
            "last_7_pitches": int(len(df_7)),
            "last_20_games_pitches": int(len(df_20g)),
            "last_30_pitches": int(len(df_30)),
            "last_20_games": len(last_20_dates),
        }
    }
