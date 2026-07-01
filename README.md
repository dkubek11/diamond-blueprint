# Diamond Blueprint
### Professional Baseball Pitch Sequencing Scouting System

---

## Overview

Diamond Blueprint is a full-stack baseball scouting application that gives coaches, scouts, and analysts a real-time pitch sequencing recommendation engine backed by Statcast pitch-by-pitch data. Given a pitcher, a batter, and the current game situation (count, previous pitch, result), the system returns ranked pitch-type and location recommendations with full scoring transparency.

The application was built on a combination of customized data fitted into one score. It is a function of count leverage, batter tendencies, pitcher movement profiles, head-to-head history, and what has happened in the at-bat. Every recommendation the system makes is grounded in those five dimensions simultaneously.

**What it does:**
- Pulls every pitch thrown in the 2026 MLB season from Statcast and aggregates it by pitcher, count, batter handedness, and previous pitch type
- Scores each pitch type using a composite formula weighted by count leverage
- Applies three independent modifiers on top of the base score: head-to-head history, pitch sequencing/result, and movement profile
- Surfaces a Situation Goal feature that re-ranks recommendations based on game context: Need a K, Need a Ground Ball, or Need Weak Contact
- Displays a full hitter profile with official MLB Stats API splits, hot/cold zone grids, and pitch vulnerability breakdowns
- Shows today's MLB schedule with projected lineups and one-click access to the scouting simulator for any matchup

---

## Features

### Pitch Recommendation Engine
The core feature. When a scout selects a pitcher, batter, count, and optionally the previous pitch and result, the system queries the pitch aggregates and computes a ranked list of pitch type recommendations. The engine first looks for matchup-specific data. If fewer than 10 pitches exist in that matchup, it falls back to pitcher-level aggregates across all batters of the same handedness. If no count-specific data exists, it falls back to the same strike count, then finally to any count.

### Situation Goal
A game-situation filter that re-ranks recommendations based on what the pitcher needs most in that moment.

| Goal | Re-ranks by | Formula |
|---|---|---|
| Need a K | Strikeout potential | Whiff Rate × 0.65 + Chase Rate × 0.35 |
| Need a Ground Ball | Ground ball tendency | GB% × 0.80 + (0.500 − xwOBA) × 0.20 |
| Need Weak Contact | Contact suppression | (0.500 − xwOBA) × 0.70 + GB% × 0.30 |

### Hitter Profile
A three-tab panel with a complete scouting view of any batter:
- **Recent Splits:** PA, AVG, K%, BB%, Whiff%, xwOBA for last 7 and last 30 days. AVG/K%/BB% pulled from the MLB Stats API for official accuracy. Whiff% and xwOBA derived from Statcast pitch data.
- **Hot/Cold Zones:** A 9-zone + 4 chase-zone strike zone grid colored by xwOBA over the batter's last 20 games. Navy = pitcher-favorable. Red = hitter-favorable.
- **Pitch Vulnerability:** Per pitch type faced — whiff%, chase%, hard hit%, GB%, avg exit velocity, and xwOBA. Sorted by xwOBA so the pitcher's best weapon against this batter appears first.

### Head-to-Head History
Complete at-bat-by-at-bat record between the pitcher and batter sourced live from Baseball Savant (2015–present). Each at-bat is expandable to show the full pitch sequence with type, velocity, description, count, and terminal event.

### Sequence Chain
A 3-pitch recursive projection showing the best pitch to throw now, then the best follow-up, then the best follow-up to that. Useful for planning an at-bat strategy rather than just the next pitch.

### Today's Games Dashboard
Today's MLB schedule via the MLB Stats API with probable pitchers, game times, and status. Confirmed lineups shown when available; projected lineups used as fallback. One click opens the full simulator for any matchup.

---

## Scoring Engine

### Base Score Formula

```
score = −(avg_run_value × w₁) + (whiff_rate × w₂) + (called_strike_rate × w₃) + (chase_rate × w₄) + (0.500 − avg_xwoba) × w₅
```

Run value is negated because more negative = better for the pitcher. xwOBA is measured against the 0.500 cap so that lower contact quality produces a higher score.

### Count Weights

All 12 counts have custom weights reflecting the leverage and strategic priorities of each situation. Weights sum to 1.0.

| Count | Category | Run Value | Whiff | Called Strike | Chase | Contact |
|---|---|---|---|---|---|---|
| 0-0 | First Pitch | 0.40 | 0.20 | 0.15 | 0.05 | 0.20 |
| 0-1 | Early Ahead | 0.35 | 0.275 | 0.175 | 0.10 | 0.10 |
| 1-0 | Early Behind | 0.35 | 0.275 | 0.175 | 0.05 | 0.15 |
| 1-1 | Even | 0.35 | 0.275 | 0.175 | 0.10 | 0.10 |
| 2-0 | Hitter's Count | 0.42 | 0.18 | 0.15 | 0.05 | 0.20 |
| 2-1 | Even (Hitter Lean) | 0.375 | 0.25 | 0.125 | 0.10 | 0.15 |
| 3-0 | Must Throw Strike | 0.50 | 0.10 | 0.20 | 0.00 | 0.20 |
| 3-1 | Hitter's Count | 0.45 | 0.15 | 0.15 | 0.025 | 0.225 |
| 0-2 | Pitcher's Count | 0.20 | 0.40 | 0.05 | 0.25 | 0.10 |
| 1-2 | Pitcher's Count | 0.225 | 0.40 | 0.05 | 0.225 | 0.10 |
| 2-2 | Two-Strike | 0.30 | 0.30 | 0.10 | 0.20 | 0.10 |
| 3-2 | Full Count | 0.35 | 0.25 | 0.15 | 0.10 | 0.15 |

### Score Modifiers

Three independent modifiers are applied on top of the base score:

**Head-to-Head Modifier (±0.12 max)**
Measures how much better or worse a pitcher performs with a given pitch type specifically against this batter compared to league average. Sourced live from Baseball Savant (2015–present).

**Sequencing / Result Modifier (±0.09 max)**
Adjusts scores based on what happened on the previous pitch using pitch tunnel logic.

| Previous Result | Same Family | Tunnel Pair | Contrasting |
|---|---|---|---|
| Swing & Miss | +0.06 | +0.03 | −0.02 |
| Weak Foul | +0.04 | +0.02 | +0.00 |
| Hard Foul | −0.09 | +0.03 | +0.05 |
| Called Strike | +0.01 | +0.01 | +0.02 |
| Ball | −0.01 | +0.00 | −0.01 |

**Movement Modifier (±0.08 max)**
Compares this pitcher's specific break profile on each pitch type to the league average. Uses IVB, HB, and spin rate to receive a modifier based on the batter's history vs pitches with similar movement. The idea is every player has a different swing path and attack angle, so movement can add or subtract from a pitch score.

**Final Score**
```
final_score = base_score + h2h_modifier + result_modifier + movement_modifier
```

---

## Score Interpretation

| Score Range | Interpretation |
|---|---|
| > 0.08 | Elite recommendation — strong pitcher advantage |
| 0.04 – 0.08 | Strong recommendation |
| 0.00 – 0.04 | Slightly positive — reasonable option |
| < 0.00 | Pitcher disadvantage with this pitch |

---

## Built With

- **Backend:** Python, FastAPI, SQLAlchemy, pybaseball, MLB Stats API
- **Frontend:** React 18, Vite
- **Database:** SQLite (local), Neon Postgres (production)
- **Data:** MLB Statcast (~378,000+ pitches, 2026 season)
