"""
Nightly aggregation job.
Reads raw pitches and writes precomputed PitchAggregate rows
that power fast API responses for the simulation.

Statcast zone grid (1–14):
  1  2  3   ← top row (in zone)
  4  5  6   ← middle row
  7  8  9   ← bottom row
 11 12 13   ← chase zones (corners/edges)
 14          ← extreme out of zone
"""
import logging

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.models.database import Pitch, PitchAggregate, SessionLocal

logger = logging.getLogger(__name__)

# Outcome classification helpers
WHIFF_DESCS = {"swinging_strike", "swinging_strike_blocked", "foul_tip"}
CHASE_DESCS = {"swinging_strike", "swinging_strike_blocked"}  # out of zone swings
CALLED_STRIKE_DESCS = {"called_strike"}

IN_ZONE_IDS = {1, 2, 3, 4, 5, 6, 7, 8, 9}


def _classify_outcomes(df: pd.DataFrame) -> pd.DataFrame:
    df["is_whiff"] = df["description"].isin(WHIFF_DESCS).astype(int)
    df["is_called_strike"] = df["description"].isin(CALLED_STRIKE_DESCS).astype(int)
    df["in_zone"] = df["zone"].isin(IN_ZONE_IDS).astype(int)
    # Chase = swing at out-of-zone pitch
    df["is_chase"] = ((~df["zone"].isin(IN_ZONE_IDS)) & df["description"].isin(CHASE_DESCS)).astype(int)
    return df


def _safe_rate(num: pd.Series, denom: pd.Series) -> pd.Series:
    return np.where(denom > 0, num / denom, np.nan)


def _build_aggregates(df: pd.DataFrame, pitcher_id: int, batter_id: int | None) -> list[dict]:
    """Compute aggregate rows for one pitcher (optionally filtered to one batter)."""
    df = _classify_outcomes(df)

    group_cols = ["pitch_type", "balls", "strikes", "prev_pitch_type", "stand", "zone"]
    grouped = df.groupby(group_cols, dropna=False)

    rows = []
    for keys, grp in grouped:
        pitch_type, balls, strikes, prev_pitch, stand, zone = keys
        if pd.isna(pitch_type) or pd.isna(zone):
            continue
        n = len(grp)
        if n < 3:  # skip truly tiny samples
            continue

        pfx_x_vals = grp["pfx_x"].dropna() if "pfx_x" in grp.columns else pd.Series([], dtype=float)
        pfx_z_vals = grp["pfx_z"].dropna() if "pfx_z" in grp.columns else pd.Series([], dtype=float)

        rows.append({
            "pitcher_id": pitcher_id,
            "batter_id": batter_id,
            "pitch_type": pitch_type,
            "balls": int(balls),
            "strikes": int(strikes),
            "prev_pitch_type": None if pd.isna(prev_pitch) else prev_pitch,
            "stand": stand,
            "zone": int(zone),
            "pitch_count": n,
            "whiff_rate": float(_safe_rate(grp["is_whiff"].sum(), n)),
            "chase_rate": float(_safe_rate(grp["is_chase"].sum(), n)),
            "called_strike_rate": float(_safe_rate(grp["is_called_strike"].sum(), n)),
            "avg_run_value": float(grp["delta_run_exp"].mean()) if grp["delta_run_exp"].notna().any() else None,
            "in_zone_rate": float(_safe_rate(grp["in_zone"].sum(), n)),
            "avg_xwoba": float(grp["estimated_woba_using_speedangle"].mean())
                if grp["estimated_woba_using_speedangle"].notna().any() else None,
            "avg_pfx_x": float(pfx_x_vals.mean()) if len(pfx_x_vals) > 0 else None,
            "avg_pfx_z": float(pfx_z_vals.mean()) if len(pfx_z_vals) > 0 else None,
        })
    return rows


def run_aggregation(db: Session | None = None, season_year: int = 2024):
    close = db is None
    if db is None:
        db = SessionLocal()

    try:
        logger.info("Loading pitches for aggregation")
        rows = db.query(Pitch).all()
        if not rows:
            logger.warning("No pitches in database — run ingest first")
            return

        df = pd.DataFrame([{
            "pitcher_id": p.pitcher_id,
            "batter_id": p.batter_id,
            "pitch_type": p.pitch_type,
            "balls": p.balls,
            "strikes": p.strikes,
            "prev_pitch_type": p.prev_pitch_type,
            "stand": p.stand,
            "zone": None,  # zone not stored on Pitch — computed below from plate_x/z
            "plate_x": p.plate_x,
            "plate_z": p.plate_z,
            "description": p.description,
            "delta_run_exp": p.delta_run_exp,
            "estimated_woba_using_speedangle": p.estimated_woba_using_speedangle,
            "pfx_x": p.pfx_x,
            "pfx_z": p.pfx_z,
        } for p in rows])

        df["zone"] = df.apply(lambda r: _coords_to_zone(r["plate_x"], r["plate_z"]), axis=1)

        logger.info("Computing pitcher-level aggregates")
        all_agg_rows = []
        for pid, grp in df.groupby("pitcher_id"):
            all_agg_rows.extend(_build_aggregates(grp, pid, batter_id=None))

        logger.info("Computing matchup-level aggregates")
        for (pid, bid), grp in df.groupby(["pitcher_id", "batter_id"]):
            if len(grp) >= 20:  # need reasonable sample for matchup-level
                all_agg_rows.extend(_build_aggregates(grp, pid, batter_id=int(bid)))

        logger.info(f"Writing {len(all_agg_rows)} aggregate rows")
        db.query(PitchAggregate).delete()
        db.bulk_insert_mappings(PitchAggregate, all_agg_rows)
        db.commit()
        logger.info("Aggregation complete")
    except Exception:
        db.rollback()
        raise
    finally:
        if close:
            db.close()


def _coords_to_zone(plate_x: float | None, plate_z: float | None) -> int | None:
    """
    Map plate_x (horizontal, ft) and plate_z (vertical, ft) to Statcast zone 1-14.
    Strike zone: x in [-0.83, 0.83], z in [1.5, 3.5] (approximate average sz_bot/sz_top)
    """
    if plate_x is None or plate_z is None:
        return None

    x, z = plate_x, plate_z
    sz_left, sz_right = -0.83, 0.83
    sz_bot, sz_top = 1.5, 3.5

    x_thirds = [sz_left, sz_left + (sz_right - sz_left) / 3, sz_left + 2 * (sz_right - sz_left) / 3, sz_right]
    z_thirds = [sz_top, sz_top - (sz_top - sz_bot) / 3, sz_top - 2 * (sz_top - sz_bot) / 3, sz_bot]

    in_x = sz_left <= x <= sz_right
    in_z = sz_bot <= z <= sz_top

    if in_x and in_z:
        col = next(i for i in range(3) if x_thirds[i] <= x <= x_thirds[i + 1]) + 1
        row = next(i for i in range(3) if z_thirds[i + 1] <= z <= z_thirds[i])
        return row * 3 + col  # 1-9

    # Shadow/chase zones 11-14
    just_outside_x = (sz_left - 0.33) <= x <= (sz_right + 0.33)
    just_outside_z = (sz_bot - 0.5) <= z <= (sz_top + 0.5)

    if just_outside_x and just_outside_z:
        if x < sz_left:
            return 11
        if x > sz_right:
            return 12
        if z > sz_top:
            return 13
        return 14

    return 14  # extreme out of zone
