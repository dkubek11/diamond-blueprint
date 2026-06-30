import sys
import logging
import sqlite3
from datetime import date, timedelta, datetime

sys.path.insert(0, r'C:\Users\dylan\projects\pitch-sequencing\backend')
logging.basicConfig(level=logging.INFO, format='%(message)s')

conn = sqlite3.connect(r'C:\Users\dylan\projects\pitch-sequencing\backend\pitch_sequencing.db')
cur = conn.cursor()
cur.execute('SELECT MAX(game_date) FROM pitches')
last = cur.fetchone()[0]
conn.close()

if not last:
    print('No existing data found.')
    sys.exit(1)

start = datetime.strptime(last, '%Y-%m-%d').date() + timedelta(days=1)
end = date.today()

if start > end:
    print(f'Already up to date through {end}')
    sys.exit(0)

print(f'Fetching {start} to {end}...')
from app.data.ingest import ingest_date_range
ingest_date_range(start, end)

print('\nRunning aggregation...')
from app.data.aggregate import run_aggregation
run_aggregation()

print('\nDone! Data is now up to date.')
