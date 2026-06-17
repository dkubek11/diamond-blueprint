import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.data.aggregate import run_aggregation
from app.data.ingest import ingest_yesterday
from app.models.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def nightly_job():
    logger.info("Running nightly ingest + aggregation")
    ingest_yesterday()
    run_aggregation()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    scheduler = BackgroundScheduler()
    scheduler.add_job(nightly_job, "cron", hour=4, minute=0)  # 4 AM daily
    scheduler.start()
    logger.info("Scheduler started — nightly job at 04:00")

    yield

    scheduler.shutdown()


app = FastAPI(
    title="Pitch Sequencing Scouting API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}
