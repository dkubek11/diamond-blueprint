# Diamond Blueprint

A full-stack baseball scouting application that tells pitchers what to throw next and why.

---

As an aspiring sports data analyst, I wanted to understand what actually goes into pitch sequencing at the MLB level — not just what pitch was thrown, but why, and whether the data could tell you what should come next.

Diamond Blueprint pulls every pitch thrown in the 2026 MLB season from Statcast and runs it through a custom scoring engine that ranks pitch recommendations by count leverage, batter tendencies, head-to-head history, pitch tunneling, previous pitch result, and movement profile. The system is sequencing-aware — it specifically looks at what pitches have been thrown in similar situations to inform what comes next.

On top of the core recommendations, a **Situation Goal** feature re-ranks pitches based on what the pitcher needs most: a strikeout, a ground ball for a double play, or weak contact. The hitter profile pulls official splits from the MLB Stats API and supplements them with Statcast-derived whiff rate and xwOBA.

---

## What It Does

- **Pitch recommendations** ranked by a composite score built from run value, whiff rate, chase rate, called strike rate, and xwOBA on contact — each weighted differently depending on the count
- **Three score modifiers**: head-to-head history against this specific batter, sequencing logic based on the previous pitch and result, and a movement modifier based on the pitcher's break profile
- **Situation Goal** — re-ranks pitches on the fly for Need a K, Need a Ground Ball, or Need Weak Contact
- **Hitter profile** with official MLB splits, hot/cold zone grid, and pitch vulnerability breakdown by pitch type
- **Today's games dashboard** with projected lineups and one-click access to the simulator for any matchup
- **Head-to-head history** pulled live from Baseball Savant (2015–present)
- **3-pitch sequence chain** projection for at-bat planning

## Built With

- **Backend:** Python, FastAPI, SQLAlchemy, Statcast / pybaseball, MLB Stats API
- **Frontend:** React, Vite
- **Database:** SQLite (local), Neon Postgres (production)
