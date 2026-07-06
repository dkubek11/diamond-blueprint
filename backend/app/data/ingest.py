"""
Statcast data ingestion pipeline.
Pulls pitch-by-pitch data from Baseball Savant via pybaseball,
computes prev_pitch_type per at-bat, and upserts into the database.
"""
import logging
from datetime import date, timedelta

import numpy as np
import pandas as pd
import pybaseball
from sqlalchemy.orm import Session

from app.models.database import Pitch, Player, SessionLocal

logger = logging.getLogger(__name__)

# Statcast columns we actually store — keeps the table lean
KEEP_COLS = [
    "game_date", "pitcher", "batter",
    "pitch_type", "plate_x", "plate_z",
    "balls", "strikes", "pitch_number",
    "description", "events", "stand", "p_throws",
    "release_speed", "pfx_x", "pfx_z",
    "estimated_woba_using_speedangle", "delta_run_exp",
    "launch_speed", "bb_type",
]


def pull_statcast(start: date, end: date) -> pd.DataFrame:
    logger.info(f"Pulling Statcast {start} → {end}")
    pybaseball.cache.enable()
    df = pybaseball.statcast(
        start_dt=start.strftime("%Y-%m-%d"),
        end_dt=end.strftime("%Y-%m-%d"),
    )
    if df is None or df.empty:
        logger.warning("No data returned from Statcast")
        return pd.DataFrame()
    return df


def _add_prev_pitch(df: pd.DataFrame) -> pd.DataFrame:
    """Add prev_pitch_type column: the pitch type thrown immediately before this one in the same at-bat."""
    df = df.sort_values(["game_pk", "at_bat_number", "pitch_number"] if "at_bat_number" in df.columns
                        else ["game_date", "pitcher", "batter", "pitch_number"])
    group_cols = ["game_pk", "at_bat_number"] if "at_bat_number" in df.columns else ["game_date", "pitcher", "batter"]
    df["prev_pitch_type"] = df.groupby(group_cols)["pitch_type"].shift(1)
    return df


def _to_pitch_rows(df: pd.DataFrame) -> list[dict]:
    df = df[df["pitch_type"].notna()].copy()
    df = df[df["pitcher"].notna() & df["batter"].notna()].copy()
    df = _add_prev_pitch(df)
    df["game_date"] = pd.to_datetime(df["game_date"]).dt.date
    df["pitcher_id"] = df["pitcher"].astype(int)
    df["batter_id"] = df["batter"].astype(int)

    FINAL_COLS = [
        "game_date", "pitcher_id", "batter_id",
        "pitch_type", "plate_x", "plate_z",
        "balls", "strikes", "pitch_number",
        "prev_pitch_type", "description", "events", "stand", "p_throws",
        "release_speed", "pfx_x", "pfx_z",
        "estimated_woba_using_speedangle", "delta_run_exp",
        "launch_speed", "bb_type",
    ]

    for col in FINAL_COLS:
        if col not in df.columns:
            df[col] = None

    rows = []
    for _, row in df[FINAL_COLS].iterrows():
        rows.append({
            col: (None if pd.isna(v) else v)
            for col, v in zip(FINAL_COLS, row)
        })
    return rows


def ingest_date_range(start: date, end: date, db: Session | None = None):
    close = db is None
    if db is None:
        db = SessionLocal()

    try:
        raw = pull_statcast(start, end)
        if raw.empty:
            return

        rows = _to_pitch_rows(raw)
        # Strip id so Postgres auto-generates primary keys
        for row in rows:
            row.pop("id", None)
        logger.info(f"Inserting {len(rows)} pitches")

        # Batch insert — skip duplicates via existing date range delete then re-insert
        db.query(Pitch).filter(
            Pitch.game_date >= start,
            Pitch.game_date <= end,
        ).delete()
        db.bulk_insert_mappings(Pitch, rows)

        # Upsert player name lookup from Chadwick register
        _sync_players(raw, db)

        db.commit()
        logger.info("Ingest complete")
    except Exception:
        db.rollback()
        raise
    finally:
        if close:
            db.close()


def _sync_players(df: pd.DataFrame, db: Session):
    """Keep the players table populated with any new pitcher/batter IDs seen."""
    try:
        roster = pybaseball.chadwick_register(save=True)
        roster = roster[roster["key_mlbam"].notna()][["key_mlbam", "name_first", "name_last", "pos"]].copy()
        roster["key_mlbam"] = roster["key_mlbam"].astype(int)
        lookup = {row["key_mlbam"]: row for _, row in roster.iterrows()}
    except Exception:
        lookup = {}

    seen_ids = set(df["pitcher"].dropna().astype(int)) | set(df["batter"].dropna().astype(int))
    existing = {p.mlb_id for p in db.query(Player.mlb_id).all()}
    new_ids = seen_ids - existing

    for mlb_id in new_ids:
        info = lookup.get(mlb_id, {})
        first = info.get("name_first", "")
        last = info.get("name_last", "")
        db.add(Player(
            mlb_id=mlb_id,
            name=f"{first} {last}".strip() or str(mlb_id),
            position=info.get("pos"),
        ))


def ingest_yesterday(db: Session | None = None):
    yesterday = date.today() - timedelta(days=1)
    ingest_date_range(yesterday, yesterday, db)


def ingest_season(season_year: int, db: Session | None = None):
    start = date(season_year, 3, 20)
    end = min(date(season_year, 11, 1), date.today())
    ingest_date_range(start, end, db)
