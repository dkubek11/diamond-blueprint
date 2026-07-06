"""
Nightly data update script — runs in GitHub Actions against Neon Postgres.
Clears existing pitch data and re-fetches the full 2026 season, then aggregates.
"""
import sys
import os
import logging
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO, format="%(message)s")

from sqlalchemy import text
from app.models.database import engine, Base

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Always wipe and re-fetch — avoids sequence/duplicate key issues
print("Clearing existing data...")
with engine.connect() as conn:
    conn.execute(text("TRUNCATE TABLE pitch_aggregates, pitches RESTART IDENTITY CASCADE"))
    conn.commit()

start = date(2026, 4, 1)
end = date.today() - timedelta(days=1)  # yesterday (today's games not final yet)

if start > end:
    print("No data to fetch yet.")
    sys.exit(0)

print(f"Fetching {start} to {end}...")
from app.data.ingest import ingest_date_range
ingest_date_range(start, end)

print("\nRunning aggregation...")
from app.data.aggregate import run_aggregation
run_aggregation()

print("\nDone! Neon database is up to date.")
