from sqlalchemy import create_engine, Column, Integer, String, Float, Date, Index
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pitch_sequencing.db")

# pg8000 is the pure-Python Postgres driver used on Render; rewrite the URL scheme if needed
_db_url = DATABASE_URL
if _db_url.startswith("postgresql://") or _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+pg8000://", 1).replace("postgres://", "postgresql+pg8000://", 1)

engine = create_engine(_db_url, connect_args={"check_same_thread": False} if "sqlite" in _db_url else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    mlb_id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    position = Column(String)
    throws = Column(String)
    bats = Column(String)
    team_id = Column(Integer)
    team_abbr = Column(String)


class Pitch(Base):
    __tablename__ = "pitches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_date = Column(Date, nullable=False)
    pitcher_id = Column(Integer, nullable=False)
    batter_id = Column(Integer, nullable=False)
    pitch_type = Column(String)
    plate_x = Column(Float)
    plate_z = Column(Float)
    balls = Column(Integer)
    strikes = Column(Integer)
    pitch_number = Column(Integer)
    prev_pitch_type = Column(String)
    description = Column(String)
    events = Column(String)
    stand = Column(String)
    p_throws = Column(String)
    release_speed = Column(Float)
    pfx_x = Column(Float)
    pfx_z = Column(Float)
    estimated_woba_using_speedangle = Column(Float)
    delta_run_exp = Column(Float)
    launch_speed = Column(Float)   # exit velocity (mph)
    bb_type = Column(String)       # ground_ball, fly_ball, line_drive, popup

    __table_args__ = (
        Index("ix_pitches_pitcher_batter", "pitcher_id", "batter_id"),
        Index("ix_pitches_pitcher_id", "pitcher_id"),
        Index("ix_pitches_batter_id", "batter_id"),
        Index("ix_pitches_game_date", "game_date"),
    )


class PitchAggregate(Base):
    __tablename__ = "pitch_aggregates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pitcher_id = Column(Integer, nullable=False)
    batter_id = Column(Integer)          # null = pitcher-level aggregate
    pitch_type = Column(String, nullable=False)
    balls = Column(Integer, nullable=False)
    strikes = Column(Integer, nullable=False)
    prev_pitch_type = Column(String)     # null = any / first pitch
    stand = Column(String, nullable=False)
    zone = Column(Integer, nullable=False)
    pitch_count = Column(Integer, nullable=False)
    whiff_rate = Column(Float)
    chase_rate = Column(Float)
    called_strike_rate = Column(Float)
    avg_run_value = Column(Float)
    in_zone_rate = Column(Float)
    avg_xwoba = Column(Float)         # avg xwOBA on contact — lower = better for pitcher
    avg_pfx_x = Column(Float)         # avg horizontal break (ft, arm-side positive for RHP)
    avg_pfx_z = Column(Float)         # avg induced vertical break (ft, positive = rise)

    __table_args__ = (
        Index("ix_agg_pitcher_batter", "pitcher_id", "batter_id"),
        Index("ix_agg_count", "balls", "strikes"),
    )


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
