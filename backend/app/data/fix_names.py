"""
One-time script to backfill player names using pybaseball's playerid_lookup.
Run with: python -m app.data.fix_names
"""
import logging
import pybaseball
from app.models.database import SessionLocal, Player

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_player_names():
    db = SessionLocal()
    try:
        players = db.query(Player).all()
        ids = [p.mlb_id for p in players]
        logger.info(f"Looking up names for {len(ids)} players")

        roster = pybaseball.chadwick_register(save=True)
        roster = roster[roster["key_mlbam"].notna()].copy()
        roster["key_mlbam"] = roster["key_mlbam"].astype(int)
        lookup = {
            int(row["key_mlbam"]): f"{row['name_first']} {row['name_last']}".strip()
            for _, row in roster.iterrows()
            if row.get("name_first") or row.get("name_last")
        }

        updated = 0
        for player in players:
            name = lookup.get(player.mlb_id)
            if name and name.strip():
                player.name = name
                updated += 1

        db.commit()
        logger.info(f"Updated {updated} of {len(players)} players")
    finally:
        db.close()

if __name__ == "__main__":
    fix_player_names()
