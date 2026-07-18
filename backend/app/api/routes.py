from datetime import date
from typing import Optional

import math
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.models.database import Player, PitchAggregate, Pitch, get_db
from app.services.simulation import get_recommendations, PitchRecommendation
from app.services.hitter_profile import get_hitter_profile
from app.services.h2h_modifier import compute_h2h_modifiers
from app.services.movement_modifier import compute_movement_modifiers

router = APIRouter()


# ── Player search ──────────────────────────────────────────────────────────────

@router.get("/players/search")
def search_players(q: str = Query(min_length=2), db: Session = Depends(get_db)):
    results = db.query(Player).filter(Player.name.ilike(f"%{q}%")).limit(20).all()
    return [{"id": p.mlb_id, "name": p.name, "position": p.position,
             "team_id": p.team_id, "team_abbr": p.team_abbr} for p in results]


@router.get("/players/{mlb_id}")
def get_player(mlb_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.mlb_id == mlb_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    # Infer batter handedness from pitch data if not stored
    bats = player.bats
    if not bats:
        row = (
            db.query(Pitch.stand)
            .filter(Pitch.batter_id == mlb_id, Pitch.stand.isnot(None))
            .first()
        )
        if row:
            bats = row[0]

    return {"id": player.mlb_id, "name": player.name, "position": player.position,
            "throws": player.throws, "bats": bats,
            "team_id": player.team_id, "team_abbr": player.team_abbr}


# ── Pitcher arsenal overview ───────────────────────────────────────────────────

@router.get("/pitcher/{pitcher_id}/arsenal")
def pitcher_arsenal(pitcher_id: int, stand: str = "R", db: Session = Depends(get_db)):
    """Returns overall pitch mix and effectiveness stats for a pitcher vs a given handedness."""
    rows = (
        db.query(PitchAggregate)
        .filter(
            PitchAggregate.pitcher_id == pitcher_id,
            PitchAggregate.batter_id == None,  # noqa: E711
            PitchAggregate.stand == stand,
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No data for this pitcher")

    by_pitch: dict = {}
    for r in rows:
        pt = r.pitch_type
        if pt not in by_pitch:
            by_pitch[pt] = {"pitch_count": 0, "run_values": [], "whiff_rates": [], "chase_rates": []}
        by_pitch[pt]["pitch_count"] += r.pitch_count
        if r.avg_run_value is not None:
            by_pitch[pt]["run_values"].append(r.avg_run_value)
        if r.whiff_rate is not None:
            by_pitch[pt]["whiff_rates"].append(r.whiff_rate)
        if r.chase_rate is not None:
            by_pitch[pt]["chase_rates"].append(r.chase_rate)

    total = sum(v["pitch_count"] for v in by_pitch.values())
    result = []
    for pt, data in by_pitch.items():
        result.append({
            "pitch_type": pt,
            "usage_pct": round(data["pitch_count"] / total * 100, 1) if total else 0,
            "pitch_count": data["pitch_count"],
            "avg_run_value": round(sum(data["run_values"]) / len(data["run_values"]), 4) if data["run_values"] else None,
            "whiff_rate": round(sum(data["whiff_rates"]) / len(data["whiff_rates"]), 3) if data["whiff_rates"] else None,
            "chase_rate": round(sum(data["chase_rates"]) / len(data["chase_rates"]), 3) if data["chase_rates"] else None,
        })

    result.sort(key=lambda x: x["usage_pct"], reverse=True)
    return {"pitcher_id": pitcher_id, "stand": stand, "arsenal": result}


# ── Simulation: step-through at-bat ───────────────────────────────────────────

class SimulationRequest(BaseModel):
    pitcher_id: int
    batter_id: int
    balls: int
    strikes: int
    stand: str
    prev_pitch_type: Optional[str] = None
    prev_pitch_result: Optional[str] = None   # swing_miss | weak_foul | hard_foul | called_strike | ball


class ZoneResult(BaseModel):
    zone: int
    zone_label: str
    pitch_count: int
    whiff_rate: Optional[float]
    chase_rate: Optional[float]
    called_strike_rate: Optional[float]
    avg_run_value: Optional[float]
    avg_xwoba: Optional[float]
    score: float


class PitchResult(BaseModel):
    pitch_type: str
    pitch_label: str
    total_pitches: int
    avg_run_value: Optional[float]
    whiff_rate: Optional[float]
    chase_rate: Optional[float]
    avg_xwoba: Optional[float]
    avg_pfx_x: Optional[float]
    avg_pfx_z: Optional[float]
    best_zone: Optional[ZoneResult]
    zones: list[ZoneResult]
    score: float
    base_score: float
    h2h_modifier: float
    result_modifier: float
    movement_modifier: float
    score_components: dict[str, float]
    count_category: str
    weights_used: dict[str, float]


def _clean(v):
    """Replace NaN/Inf floats with None so JSON serialization doesn't crash."""
    if v is None: return None
    try:
        return None if math.isnan(v) or math.isinf(v) else v
    except TypeError:
        return v


@router.post("/simulate")
def simulate(req: SimulationRequest, db: Session = Depends(get_db)) -> list[PitchResult]:
    if req.balls > 3 or req.strikes > 2 or req.balls < 0 or req.strikes < 0:
        raise HTTPException(status_code=422, detail="Invalid count")

    h2h_mods = compute_h2h_modifiers(req.pitcher_id, req.batter_id)
    mov_mods = compute_movement_modifiers(req.pitcher_id, req.batter_id, db)
    recs = get_recommendations(
        db=db,
        pitcher_id=req.pitcher_id,
        batter_id=req.batter_id,
        balls=req.balls,
        strikes=req.strikes,
        stand=req.stand,
        prev_pitch_type=req.prev_pitch_type,
        prev_pitch_result=req.prev_pitch_result,
        h2h_modifiers=h2h_mods,
        movement_modifiers=mov_mods,
    )
    if not recs:
        raise HTTPException(status_code=404, detail="Insufficient data for this matchup/count")

    def to_zone(z):
        return ZoneResult(
            zone=z.zone, zone_label=z.zone_label, pitch_count=z.pitch_count,
            whiff_rate=_clean(z.whiff_rate), chase_rate=_clean(z.chase_rate),
            called_strike_rate=_clean(z.called_strike_rate),
            avg_run_value=_clean(z.avg_run_value), avg_xwoba=_clean(z.avg_xwoba),
            score=_clean(z.score) or 0.0,
        )

    return [
        PitchResult(
            pitch_type=r.pitch_type, pitch_label=r.pitch_label,
            total_pitches=r.total_pitches,
            avg_run_value=_clean(r.avg_run_value),
            whiff_rate=_clean(r.whiff_rate), chase_rate=_clean(r.chase_rate),
            avg_xwoba=_clean(r.avg_xwoba),
            avg_pfx_x=_clean(r.avg_pfx_x),
            avg_pfx_z=_clean(r.avg_pfx_z),
            best_zone=to_zone(r.best_zone) if r.best_zone else None,
            zones=[to_zone(z) for z in r.zones],
            score=_clean(r.score) or 0.0,
            base_score=_clean(r.base_score) or 0.0,
            h2h_modifier=_clean(r.h2h_modifier) or 0.0,
            result_modifier=_clean(r.result_modifier) or 0.0,
            movement_modifier=_clean(r.movement_modifier) or 0.0,
            score_components={k: _clean(v) or 0.0 for k, v in r.score_components.items()},
            count_category=r.count_category, weights_used=r.weights_used,
        )
        for r in recs
    ]


# ── Sequence chain projection ─────────────────────────────────────────────────

@router.get("/sequence-chain/{pitcher_id}/{batter_id}")
def sequence_chain(
    pitcher_id: int, batter_id: int,
    balls: int = 0, strikes: int = 0, stand: str = "R",
    current_pitch: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Projects 3-pitch sequences. For each top pitch right now, shows what the
    optimal follow-up pitches are (using prev_pitch_type recursively).
    Returns top 3 starting pitches, each with a 2-pitch projected follow-up chain.
    """
    h2h_mods = compute_h2h_modifiers(pitcher_id, batter_id)

    def top_recs(prev: Optional[str], n: int = 3):
        recs = get_recommendations(
            db=db, pitcher_id=pitcher_id, batter_id=batter_id,
            balls=balls, strikes=strikes, stand=stand,
            prev_pitch_type=prev, h2h_modifiers=h2h_mods,
        )
        return [
            {
                "pitch_type": r.pitch_type,
                "pitch_label": r.pitch_label,
                "score": _clean(r.score) or 0.0,
                "whiff_rate": _clean(r.whiff_rate),
                "avg_run_value": _clean(r.avg_run_value),
                "best_zone": r.best_zone.zone_label if r.best_zone else None,
            }
            for r in recs[:n]
        ]

    # Start from current_pitch if mid-at-bat, else from scratch
    step1_list = top_recs(current_pitch, n=3)

    chains = []
    for step1 in step1_list:
        step2_list = top_recs(step1["pitch_type"], n=2)
        chain = {"pitch": step1, "followups": []}
        for step2 in step2_list:
            step3_list = top_recs(step2["pitch_type"], n=1)
            chain["followups"].append({
                "pitch": step2,
                "followup": step3_list[0] if step3_list else None,
            })
        chains.append(chain)

    return {
        "pitcher_id": pitcher_id, "batter_id": batter_id,
        "balls": balls, "strikes": strikes,
        "chains": chains,
    }


# ── Matchup scouting report summary ───────────────────────────────────────────

@router.get("/matchup/{pitcher_id}/{batter_id}")
def matchup_report(pitcher_id: int, batter_id: int, stand: str = "R", db: Session = Depends(get_db)):
    """
    High-level scouting report for a pitcher vs batter matchup.
    Returns best pitches across all counts, key weaknesses, and sequencing tips.
    """
    pitcher = db.query(Player).filter(Player.mlb_id == pitcher_id).first()
    batter = db.query(Player).filter(Player.mlb_id == batter_id).first()

    counts = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1), (1, 2), (2, 0), (2, 1), (2, 2), (3, 0), (3, 1), (3, 2)]
    count_breakdowns = []
    for balls, strikes in counts:
        recs = get_recommendations(db, pitcher_id, batter_id, balls, strikes, stand)
        if recs:
            top = recs[0]
            count_breakdowns.append({
                "count": f"{balls}-{strikes}",
                "balls": balls,
                "strikes": strikes,
                "top_pitch": top.pitch_type,
                "top_pitch_label": top.pitch_label,
                "top_zone": top.best_zone.zone_label if top.best_zone else None,
                "avg_run_value": top.avg_run_value,
                "whiff_rate": top.whiff_rate,
                "score": top.score,
            })

    return {
        "pitcher": {"id": pitcher_id, "name": pitcher.name if pitcher else str(pitcher_id)},
        "batter": {"id": batter_id, "name": batter.name if batter else str(batter_id)},
        "stand": stand,
        "count_breakdown": count_breakdowns,
    }


# ── Head-to-head at-bat history (all seasons via Baseball Savant) ──────────────

EVENT_LABELS = {
    "single": "1B", "double": "2B", "triple": "3B", "home_run": "HR",
    "strikeout": "K", "strikeout_double_play": "K",
    "walk": "BB", "intent_walk": "IBB", "hit_by_pitch": "HBP",
    "field_out": "Out", "force_out": "Out", "grounded_into_double_play": "GDP",
    "double_play": "GDP", "fielders_choice": "FC", "fielders_choice_out": "FC",
    "field_error": "E", "sac_fly": "SF", "sac_bunt": "SH",
}

DESC_LABELS = {
    "called_strike": "Called Strike",
    "swinging_strike": "Swing & Miss",
    "swinging_strike_blocked": "Swing & Miss",
    "ball": "Ball",
    "blocked_ball": "Ball",
    "foul": "Foul",
    "foul_tip": "Foul Tip",
    "hit_into_play": "In Play",
    "hit_into_play_no_out": "In Play",
    "hit_into_play_score": "In Play",
}

@router.get("/h2h/{pitcher_id}/{batter_id}")
def h2h_history(pitcher_id: int, batter_id: int):
    import io, csv as csv_mod
    from datetime import date as _date
    current_year = _date.today().year
    seasons = "|".join(str(y) for y in range(2015, current_year + 1)) + "|"
    url = (
        "https://baseballsavant.mlb.com/statcast_search/csv"
        f"?all=true"
        f"&player_type=pitcher"
        f"&pitchers_lookup%5B%5D={pitcher_id}"
        f"&batters_lookup%5B%5D={batter_id}"
        f"&hfSea={seasons.replace('|', '%7C')}"
        f"&hfGT=R%7C"
        f"&type=details"
        f"&min_pitches=0&min_results=0&min_abs=0"
    )
    try:
        resp = httpx.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        text = resp.content.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Baseball Savant error: {e}")

    reader = csv_mod.DictReader(io.StringIO(text))
    rows = list(reader)

    if not rows or "pitch_type" not in (rows[0] if rows else {}):
        return {"pitcher_id": pitcher_id, "batter_id": batter_id, "at_bats": []}

    # Group by game_pk + at_bat_number
    from collections import defaultdict, OrderedDict
    ab_map: dict = OrderedDict()
    for row in rows:
        key = (row.get("game_pk", ""), row.get("at_bat_number", ""))
        if key not in ab_map:
            ab_map[key] = []
        ab_map[key].append(row)

    at_bats = []
    for (game_pk, ab_num), pitches in ab_map.items():
        pitches_sorted = sorted(pitches, key=lambda r: int(r.get("pitch_number", 0) or 0))
        terminal = next((p for p in reversed(pitches_sorted) if p.get("events")), None)
        if not terminal:
            continue
        outcome = EVENT_LABELS.get(terminal["events"], terminal["events"])
        sequence = []
        for p in pitches_sorted:
            pt = p.get("pitch_type") or "?"
            desc = p.get("description", "")
            release = p.get("release_speed")
            sequence.append({
                "pitch_num": p.get("pitch_number"),
                "pitch_type": pt,
                "pitch_label": {
                    "FF":"4-Seam Fastball","SI":"Sinker","FC":"Cutter",
                    "SL":"Slider","ST":"Sweeper","CU":"Curveball",
                    "KC":"Knuckle Curve","CH":"Changeup","FS":"Splitter",
                }.get(pt, pt),
                "description": DESC_LABELS.get(desc, desc.replace("_", " ").title()),
                "velo": round(float(release), 1) if release else None,
                "balls": p.get("balls"),
                "strikes": p.get("strikes"),
                "zone": p.get("zone"),
                "plate_x": round(float(p["plate_x"]), 3) if p.get("plate_x") else None,
                "plate_z": round(float(p["plate_z"]), 3) if p.get("plate_z") else None,
            })

        game_date = terminal.get("game_date", "")
        season = game_date[:4] if game_date else "?"
        at_bats.append({
            "date": game_date,
            "season": season,
            "game_pk": game_pk,
            "pitch_count": len(pitches_sorted),
            "outcome": outcome,
            "stand": pitches_sorted[0].get("stand", ""),
            "sequence": sequence,
        })

    at_bats.sort(key=lambda x: x["date"], reverse=True)
    return {"pitcher_id": pitcher_id, "batter_id": batter_id, "at_bats": at_bats}


# ── Hitter profile — recent splits, hot/cold zones, pitch vulnerability ────────

@router.get("/hitter/{batter_id}/profile")
def hitter_profile(batter_id: int, db: Session = Depends(get_db)):
    return get_hitter_profile(db, batter_id)


# ── Today's games — probable pitchers + lineups ────────────────────────────────

def _fetch_projected_lineup(team_id: int) -> list[dict]:
    """Fetch the most recent lineup for a team from the last 7 days as a projection."""
    from datetime import timedelta
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=7)
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule"
        f"?sportId=1&teamId={team_id}"
        f"&startDate={start}&endDate={end}"
        f"&hydrate=lineups"
        f"&gameType=R"
    )
    try:
        resp = httpx.get(url, timeout=8)
        data = resp.json()
        for date_entry in reversed(data.get("dates", [])):
            for game in date_entry.get("games", []):
                lineups = game.get("lineups", {})
                away_id = game.get("teams", {}).get("away", {}).get("team", {}).get("id")
                home_id = game.get("teams", {}).get("home", {}).get("team", {}).get("id")
                if away_id == team_id:
                    players = lineups.get("awayPlayers", [])
                elif home_id == team_id:
                    players = lineups.get("homePlayers", [])
                else:
                    continue
                if players:
                    return [
                        {"id": p.get("id"), "name": p.get("fullName"), "batting_order": i + 1}
                        for i, p in enumerate(players)
                    ]
    except Exception:
        pass
    return []


@router.get("/games/today")
def games_today():
    today = date.today().strftime("%Y-%m-%d")
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule"
        f"?sportId=1&date={today}"
        f"&hydrate=probablePitcher,lineups,team,linescore"
    )
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")

    games = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            away_team = game.get("teams", {}).get("away", {})
            home_team = game.get("teams", {}).get("home", {})

            def extract_team(t):
                team = t.get("team", {})
                probable = t.get("probablePitcher", {})
                return {
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "team_abbr": team.get("abbreviation"),
                    "probable_pitcher": {
                        "id": probable.get("id"),
                        "name": probable.get("fullName"),
                    } if probable else None,
                }

            lineups = game.get("lineups", {})
            away_raw = lineups.get("awayPlayers", [])
            home_raw = lineups.get("homePlayers", [])

            away_info = extract_team(away_team)
            home_info = extract_team(home_team)

            away_lineup = (
                [{"id": p.get("id"), "name": p.get("fullName"), "batting_order": i + 1} for i, p in enumerate(away_raw)]
                if away_raw else _fetch_projected_lineup(away_info["team_id"])
            )
            home_lineup = (
                [{"id": p.get("id"), "name": p.get("fullName"), "batting_order": i + 1} for i, p in enumerate(home_raw)]
                if home_raw else _fetch_projected_lineup(home_info["team_id"])
            )

            status = game.get("status", {}).get("detailedState", "")
            game_time = game.get("gameDate", "")

            games.append({
                "game_pk": game.get("gamePk"),
                "game_time": game_time,
                "status": status,
                "away": {**away_info, "lineup": away_lineup, "lineup_confirmed": bool(away_raw)},
                "home": {**home_info, "lineup": home_lineup, "lineup_confirmed": bool(home_raw)},
            })

    return {"date": today, "games": games}


@router.get("/games/tomorrow")
def games_tomorrow():
    from datetime import timedelta
    tomorrow = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    url = (
        f"https://statsapi.mlb.com/api/v1/schedule"
        f"?sportId=1&date={tomorrow}"
        f"&hydrate=probablePitcher,lineups,team,linescore"
    )
    try:
        resp = httpx.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")

    games = []
    for date_entry in data.get("dates", []):
        for game in date_entry.get("games", []):
            away_team = game.get("teams", {}).get("away", {})
            home_team = game.get("teams", {}).get("home", {})

            def extract_team(t):
                team = t.get("team", {})
                probable = t.get("probablePitcher", {})
                return {
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "team_abbr": team.get("abbreviation"),
                    "probable_pitcher": {
                        "id": probable.get("id"),
                        "name": probable.get("fullName"),
                    } if probable else None,
                }

            lineups = game.get("lineups", {})
            away_raw = lineups.get("awayPlayers", [])
            home_raw = lineups.get("homePlayers", [])

            away_info = extract_team(away_team)
            home_info = extract_team(home_team)

            away_lineup = (
                [{"id": p.get("id"), "name": p.get("fullName"), "batting_order": i + 1} for i, p in enumerate(away_raw)]
                if away_raw else _fetch_projected_lineup(away_info["team_id"])
            )
            home_lineup = (
                [{"id": p.get("id"), "name": p.get("fullName"), "batting_order": i + 1} for i, p in enumerate(home_raw)]
                if home_raw else _fetch_projected_lineup(home_info["team_id"])
            )

            status = game.get("status", {}).get("detailedState", "")
            game_time = game.get("gameDate", "")

            games.append({
                "game_pk": game.get("gamePk"),
                "game_time": game_time,
                "status": status,
                "away": {**away_info, "lineup": away_lineup, "lineup_confirmed": bool(away_raw)},
                "home": {**home_info, "lineup": home_lineup, "lineup_confirmed": bool(home_raw)},
            })

    return {"date": tomorrow, "games": games}
