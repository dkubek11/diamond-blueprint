"""
One-time seed script to backfill a full season of Statcast data.
Run this manually: python -m app.data.seed --year 2024
"""
import argparse
import logging

from app.data.aggregate import run_aggregation
from app.data.ingest import ingest_season
from app.models.database import init_db

logging.basicConfig(level=logging.INFO)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=2024)
    args = parser.parse_args()

    init_db()
    print(f"Ingesting {args.year} season — this will take 10–20 minutes...")
    ingest_season(args.year)
    print("Running aggregation...")
    run_aggregation()
    print("Done.")


if __name__ == "__main__":
    main()
