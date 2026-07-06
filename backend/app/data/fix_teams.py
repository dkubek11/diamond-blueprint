"""
One-time script to populate team_id and team_abbr on all players
using the MLB Stats API (free, no auth).
Run with: python -m app.data.fix_teams
"""
import logging
import time
import requests
from app.models.database import SessionLocal, Player

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MLB_API = "https://statsapi.mlb.com/api/v1/people"


def fetch_team(mlb_id: int) -> tuple[int | None, str | None]:
    try:
        r = requests.get(f"{MLB_API}/{mlb_id}?hydrate=currentTeam", timeout=5)
        if r.status_code != 200:
            return None, None
        data = r.json().get("people", [{}])[0]
        team = data.get("currentTeam", {})
        return team.get("id"), team.get("abbreviation")
    except Exception:
        return None, None


def fix_teams():
    db = SessionLocal()
    try:
        players = db.query(Player).all()
        logger.info(f"Fetching team info for {len(players)} players")
        updated = 0
        for i, player in enumerate(players):
            if player.team_id:
                continue
            team_id, team_abbr = fetch_team(player.mlb_id)
            if team_id:
                player.team_id = team_id
                player.team_abbr = team_abbr
                updated += 1
            if i % 50 == 0 and i > 0:
                db.commit()
                logger.info(f"  {i}/{len(players)} processed, {updated} updated")
            time.sleep(0.05)  # be polite to MLB API
        db.commit()
        logger.info(f"Done — updated {updated} of {len(players)} players")
    finally:
        db.close()


if __name__ == "__main__":
    fix_teams()
