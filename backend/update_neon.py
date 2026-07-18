"""
Nightly data update script — runs in GitHub Actions against Neon Postgres.
On first run: seeds from April 1 2026.
On subsequent runs: fetches only new days since last stored date.
"""
import sys
import os
import logging
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from sqlalchemy import text, func
from app.models.database import engine, Base, SessionLocal, Pitch

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Find last stored date
db = SessionLocal()
try:
    last = db.query(func.max(Pitch.game_date)).scalar()
finally:
    db.close()

if not last:
    # First time — clear any partial data and seed from start of season
    print("No existing data found. Seeding from April 1 2026...")
    with engine.connect() as conn:
        conn.execute(text("TRUNCATE TABLE pitch_aggregates, pitches RESTART IDENTITY CASCADE"))
        conn.commit()
    start = date(2026, 4, 1)
else:
    # Incremental — only fetch new days
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
