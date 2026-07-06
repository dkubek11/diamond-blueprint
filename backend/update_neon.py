"""
Nightly data update script — runs in GitHub Actions against Neon Postgres.
Fetches Statcast data from the last stored date through today, then re-aggregates.
"""
import sys
import os
import logging
from datetime import date, timedelta

# Ensure the backend directory is on the path so app.* imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from sqlalchemy import text
from app.models.database import SessionLocal, engine, Base, Pitch

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Check last date in DB
db = SessionLocal()
try:
    from sqlalchemy import func
    last = db.query(func.max(Pitch.game_date)).scalar()
finally:
    db.close()

if not last:
    # No data — seed from start of 2026 season and clear any partial data
    start = date(2026, 4, 1)
    print("No existing data, clearing tables and seeding from April 1 2026...")
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE pitch_aggregates, pitches RESTART IDENTITY CASCADE"))
        conn.commit()
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
