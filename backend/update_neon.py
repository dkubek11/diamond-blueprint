"""
Nightly data update script — runs in GitHub Actions against Neon Postgres.
Fetches Statcast data from the last stored date through today, then re-aggregates.
"""
import sys
import logging
from datetime import date, timedelta, datetime

logging.basicConfig(level=logging.INFO, format="%(message)s")

from app.models.database import SessionLocal
from app.models.database import Pitch

db = SessionLocal()
try:
    from sqlalchemy import func
    last = db.query(func.max(Pitch.game_date)).scalar()
finally:
    db.close()

if not last:
    # No data at all — seed from start of 2026 season
    start = date(2026, 4, 1)
else:
    start = last + timedelta(days=1)

end = date.today() - timedelta(days=1)  # yesterday (today's games not final yet)

if start > end:
    print(f"Already up to date through {end}")
    sys.exit(0)

print(f"Fetching {start} to {end}...")
from app.data.ingest import ingest_date_range
ingest_date_range(start, end)

print("\nRunning aggregation...")
from app.data.aggregate import run_aggregation
run_aggregation()

print("\nDone! Neon database is up to date.")
