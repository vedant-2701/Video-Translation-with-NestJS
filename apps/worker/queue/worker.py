"""
BullMQ Worker — Phase 5 hardened version.

Improvements over Phase 4:
  - Structured JSON logging via structlog
  - Per-job timeout guard (asyncio.wait_for)
  - Retry classification: transient errors retry, permanent errors don't
  - DB connection pooling (single persistent connection, reconnect on failure)
  - Redis publisher reuse across jobs
  - Graceful SIGTERM/SIGINT shutdown
"""

import os
import asyncio
import json
import signal
import structlog
import psycopg2
import psycopg2.pool
import redis as redis_client
from bullmq import Worker

from config import settings
from utils.logging_config import configure_logging
from pipeline.pipeline import PipelineBuilder, Pipeline
from pipeline.stage import PipelineContext
from pipeline.stages import (
    AudioExtractorStage,
    TranscriberStage,
    TranslatorStage,
    SynthesizerStage,
    VideoMergerStage,
)

# Configure structured logging before anything else
configure_logging()
logger = structlog.get_logger()

QUEUE_NAME = "translation"

# Per-job processing timeout in seconds (matches API-side BullMQ timeout)
JOB_TIMEOUT_SECONDS = int(os.environ.get("JOB_TIMEOUT_SECONDS", str(30 * 60)))  # 30 min

# ─────────────────────────────────────────────────────────────
# Retry classification
# ─────────────────────────────────────────────────────────────

# Errors that are worth retrying (transient, infra issues)
RETRYABLE_ERROR_SUBSTRINGS = [
    "connection refused",
    "timeout",
    "temporarily unavailable",
    "too many connections",
    "could not connect",
    "broken pipe",
]

# Errors that are permanent — retrying wastes time
PERMANENT_ERROR_SUBSTRINGS = [
    "no translation path",
    "language",
    "not supported",
    "invalid file",
    "empty transcript",
    "no package for",
]


def _is_retryable(error: Exception) -> bool:
    """
    Classify whether an error is worth retrying.
    Transient infra errors → retry with backoff.
    Permanent logic errors → fail immediately, don't waste retries.
    """
    msg = str(error).lower()
    if any(sub in msg for sub in PERMANENT_ERROR_SUBSTRINGS):
        return False
    if any(sub in msg for sub in RETRYABLE_ERROR_SUBSTRINGS):
        return True
    # Default: retry unknown errors (safer than silently dropping)
    return True


class PermanentJobError(Exception):
    """
    Raise this to signal BullMQ should NOT retry this job.
    Used for logic errors where retrying would always fail.
    """
    pass


# ─────────────────────────────────────────────────────────────
# Connection pool — DB
# ─────────────────────────────────────────────────────────────

_db_pool: psycopg2.pool.SimpleConnectionPool | None = None


def _get_db_pool() -> psycopg2.pool.SimpleConnectionPool:
    global _db_pool
    if _db_pool is None or _db_pool.closed:
        _db_pool = psycopg2.pool.SimpleConnectionPool(
            minconn=1,
            maxconn=5,
            dsn=settings.database_url,
        )
    return _db_pool


def _update_job(
    job_id: str,
    status: str,
    progress: int = 0,
    error: str | None = None,
) -> None:
    pool = _get_db_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE translation_jobs
                SET status = %s, progress = %s, error_message = %s
                WHERE id = %s
                """,
                (status, progress, error, job_id),
            )
        conn.commit()
    except Exception as db_err:
        conn.rollback()
        logger.error("DB update failed", job_id=job_id, error=str(db_err))
    finally:
        pool.putconn(conn)


# ─────────────────────────────────────────────────────────────
# Redis publisher — reused across jobs
# ─────────────────────────────────────────────────────────────

_redis_publisher: redis_client.Redis | None = None


def _get_publisher() -> redis_client.Redis:
    global _redis_publisher
    if _redis_publisher is None or not _redis_publisher.ping():
        _redis_publisher = redis_client.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
            socket_keepalive=True,
            health_check_interval=30,
        )
    return _redis_publisher


def _publish(job_id: str, progress: int, stage: str, message: str = "") -> None:
    channel = f"job:progress:{job_id}"
    payload = json.dumps({"jobId": job_id, "progress": progress, "stage": stage, "message": message})
    try:
        _get_publisher().publish(channel, payload)
    except Exception as e:
        logger.warning("Publish failed", job_id=job_id, error=str(e))


# ─────────────────────────────────────────────────────────────
# Pipeline factory
# ─────────────────────────────────────────────────────────────

def _build_pipeline() -> Pipeline:
    return (
        PipelineBuilder()
        .add_stage(AudioExtractorStage())
        .add_stage(TranscriberStage())
        .add_stage(TranslatorStage())
        .add_stage(SynthesizerStage())
        .add_stage(VideoMergerStage())
        .build()
    )


# ─────────────────────────────────────────────────────────────
# Core job execution (sync — runs in thread pool via asyncio)
# ─────────────────────────────────────────────────────────────

def _run_pipeline_sync(job_id: str, data: dict) -> None:
    """
    Runs the full pipeline synchronously.
    Executed in a thread pool executor so it doesn't block the event loop.
    """
    log = logger.bind(job_id=job_id)

    def on_progress(progress: int, stage: str) -> None:
        log.info("Stage progress", progress=progress, stage=stage)
        _update_job(job_id, "PROCESSING", progress=progress)
        _publish(job_id, progress, stage)

    ctx = PipelineContext(
        job_id=job_id,
        input_path=os.path.join(settings.storage_local_path, data["inputPath"]),
        output_path=os.path.join(settings.storage_local_path, data["outputPath"]),
        source_language=data["sourceLanguage"],
        target_language=data["targetLanguage"],
        storage_root=settings.storage_local_path,
        progress_callback=on_progress,
    )

    pipeline = _build_pipeline()
    pipeline.run(ctx)


# ─────────────────────────────────────────────────────────────
# BullMQ job handler
# ─────────────────────────────────────────────────────────────

async def process_job(job, job_token) -> None:
    data = job.data
    job_id = data["jobId"]
    attempt = getattr(job, "attemptsMade", 0) + 1
    log = logger.bind(job_id=job_id, attempt=attempt)
    log.info("Job received", source=data["sourceLanguage"], target=data["targetLanguage"])

    try:
        _update_job(job_id, "PROCESSING", progress=0)
        _publish(job_id, 0, "STARTED", f"Processing started (attempt {attempt})")

        # Run the blocking pipeline in a thread — keeps event loop free
        loop = asyncio.get_event_loop()
        await asyncio.wait_for(
            loop.run_in_executor(None, _run_pipeline_sync, job_id, data),
            timeout=JOB_TIMEOUT_SECONDS,
        )

        _update_job(job_id, "COMPLETED", progress=100)
        _publish(job_id, 100, "DONE", "Translation complete")
        log.info("Job completed successfully")

    except asyncio.TimeoutError:
        msg = f"Job exceeded {JOB_TIMEOUT_SECONDS // 60} minute timeout"
        log.error("Job timed out", timeout_seconds=JOB_TIMEOUT_SECONDS)
        _update_job(job_id, "FAILED", error=msg)
        _publish(job_id, 0, "FAILED", msg)
        # Don't retry timeouts — they'll timeout again
        raise PermanentJobError(msg)

    except PermanentJobError as exc:
        log.error("Permanent job failure — no retry", error=str(exc))
        _update_job(job_id, "FAILED", error=str(exc))
        _publish(job_id, 0, "FAILED", str(exc))
        raise  # BullMQ will exhaust attempts immediately

    except Exception as exc:
        log.error("Job failed", error=str(exc), retryable=_is_retryable(exc), exc_info=True)
        _update_job(job_id, "FAILED", error=str(exc))
        _publish(job_id, 0, "FAILED", str(exc))

        if not _is_retryable(exc):
            raise PermanentJobError(str(exc)) from exc

        raise  # Retryable — BullMQ will retry with exponential backoff


# ─────────────────────────────────────────────────────────────
# Graceful shutdown
# ─────────────────────────────────────────────────────────────

_shutdown_event = asyncio.Event()


def _handle_shutdown(signame: str) -> None:
    logger.info("Shutdown signal received", signal=signame)
    _shutdown_event.set()


# ─────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────

async def main() -> None:
    logger.info(
        "Worker starting",
        queue=QUEUE_NAME,
        redis=f"{settings.redis_host}:{settings.redis_port}",
        storage=settings.storage_local_path,
        job_timeout_minutes=JOB_TIMEOUT_SECONDS // 60,
    )

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_shutdown, sig.name)

    worker = Worker(
        QUEUE_NAME,
        process_job,
        {"connection": {"host": settings.redis_host, "port": settings.redis_port}},
    )

    logger.info("Worker ready — listening for jobs")

    # Block until shutdown signal
    await _shutdown_event.wait()

    logger.info("Shutting down worker gracefully...")
    await worker.close()

    if _db_pool and not _db_pool.closed:
        _db_pool.closeall()

    if _redis_publisher:
        _redis_publisher.close()

    logger.info("Worker shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())