"""
queue/worker.py

BullMQ worker entry point.

Responsibilities:
  - Pull jobs from the 'translation' queue (same queue NestJS pushes to)
  - Build PipelineConfig from env + job payload
  - Run VideoTranslationPipeline with a progress callback
  - Publish progress events to Redis pub/sub (consumed by NestJS SSE endpoint)
  - Update translation_jobs table in Postgres on start, progress, and completion
  - Classify errors as retryable vs permanent
  - Graceful SIGTERM/SIGINT shutdown
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal

import psycopg2
import psycopg2.pool
import redis as redis_sync
import structlog
from bullmq import Worker

from pipeline.config import PipelineConfig
from pipeline.pipeline import VideoTranslationPipeline
from utils.logging_config import configure_logging
from worker_config import WorkerSettings

configure_logging()
logger = structlog.get_logger()

QUEUE_NAME = "translation"

# ── Settings ──────────────────────────────────────────────────

settings = WorkerSettings()

# ── DB connection pool ────────────────────────────────────────

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


def _db_update(
    job_id: str,
    status: str,
    progress: int = 0,
    error_message: str | None = None,
    output_path: str | None = None,
) -> None:
    pool = _get_db_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE translation_jobs
                SET
                    status        = %s,
                    progress      = %s,
                    error_message = %s,
                    output_path   = COALESCE(%s, output_path)
                WHERE id = %s
                """,
                (status, progress, error_message, output_path, job_id),
            )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        logger.error("DB update failed", job_id=job_id, error=str(exc))
    finally:
        pool.putconn(conn)


# ── Redis publisher ───────────────────────────────────────────

_redis_pub: redis_sync.Redis | None = None


def _get_publisher() -> redis_sync.Redis:
    global _redis_pub
    if _redis_pub is None:
        _redis_pub = redis_sync.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
            socket_keepalive=True,
            health_check_interval=30,
        )
    return _redis_pub


def _publish_progress(job_id: str, progress: int, stage: str, message: str = "") -> None:
    """
    Publish a progress event to Redis channel job:progress:<jobId>.
    NestJS EventsService subscribes to this and forwards it over SSE.
    """
    channel = f"job:progress:{job_id}"
    payload = json.dumps({
        "jobId":    job_id,
        "progress": progress,
        "stage":    stage,
        "message":  message,
    })
    try:
        _get_publisher().publish(channel, payload)
    except Exception as exc:
        logger.warning("Redis publish failed", job_id=job_id, error=str(exc))


# ── Error classification ──────────────────────────────────────

_PERMANENT_ERRORS = [
    "empty transcript",
    "language not supported",
    "no translation path",
    "invalid file",
    "no package for",
    "not supported by",
    "unsupported",
]

_RETRYABLE_ERRORS = [
    "connection refused",
    "timeout",
    "temporarily unavailable",
    "broken pipe",
    "could not connect",
    "too many connections",
    "rate limit",
]


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc).lower()
    if any(s in msg for s in _PERMANENT_ERRORS):
        return False
    if any(s in msg for s in _RETRYABLE_ERRORS):
        return True
    return True  # default: retry unknown errors


class PermanentJobError(Exception):
    """Signals BullMQ to NOT retry this job."""
    pass


# ── Pipeline runner (sync — called from thread pool) ──────────

def _run_pipeline(job_id: str, data: dict) -> str:
    """
    Builds config from env + payload, wires the progress callback,
    and runs the pipeline synchronously.
    Returns the output video path.
    """
    config = PipelineConfig(
        sarvam_api_key=os.environ["SARVAM_API_KEY"],
        source_language=data["sourceLanguage"],
        target_language=data["targetLanguage"],
        output_dir=os.path.join(
            settings.storage_local_path,
            os.path.dirname(data["outputPath"]),
        ),
    )

    def on_progress(progress: int, stage: str, message: str) -> None:
        _db_update(job_id, "PROCESSING", progress=progress)
        _publish_progress(job_id, progress, stage, message)

    pipeline = VideoTranslationPipeline(config)

    # Inject progress callback into context via pipeline
    # VideoTranslationPipeline.run() creates the context internally,
    # so we patch it after construction
    original_run = pipeline.run

    def run_with_callback(input_video_path: str) -> str:
        from pipeline.context import PipelineContext
        ctx = PipelineContext(
            input_video_path=input_video_path,
            source_language=config.source_language,
            target_language=config.target_language,
            progress_callback=on_progress,
        )
        return pipeline._run_with_context(ctx)

    input_path = os.path.join(settings.storage_local_path, data["inputPath"])
    return run_with_callback(input_path)


# ── BullMQ job handler ────────────────────────────────────────

async def process_job(job, job_token) -> None:
    data    = job.data
    job_id  = data["jobId"]
    attempt = getattr(job, "attemptsMade", 0) + 1
    log     = logger.bind(job_id=job_id, attempt=attempt)

    log.info(
        "Job received",
        source=data["sourceLanguage"],
        target=data["targetLanguage"],
    )

    try:
        _db_update(job_id, "PROCESSING", progress=0)
        _publish_progress(job_id, 0, "STARTED", f"Attempt {attempt}")

        loop = asyncio.get_event_loop()
        output_path = await asyncio.wait_for(
            loop.run_in_executor(None, _run_pipeline, job_id, data),
            timeout=settings.job_timeout_seconds,
        )

        # Store only the relative portion (relative to storage_local_path)
        relative_output = os.path.relpath(output_path, settings.storage_local_path)

        _db_update(
            job_id,
            "COMPLETED",
            progress=100,
            output_path=relative_output,
        )
        _publish_progress(job_id, 100, "DONE", "Translation complete")
        log.info("Job completed", output=output_path)

    except asyncio.TimeoutError:
        msg = f"Job timed out after {settings.job_timeout_seconds // 60} minutes"
        log.error("Job timed out")
        _db_update(job_id, "FAILED", error_message=msg)
        _publish_progress(job_id, 0, "FAILED", msg)
        raise PermanentJobError(msg)

    except PermanentJobError as exc:
        log.error("Permanent failure", error=str(exc))
        _db_update(job_id, "FAILED", error_message=str(exc))
        _publish_progress(job_id, 0, "FAILED", str(exc))
        raise

    except Exception as exc:
        retryable = _is_retryable(exc)
        log.error("Job failed", error=str(exc), retryable=retryable, exc_info=True)
        _db_update(job_id, "FAILED", error_message=str(exc))
        _publish_progress(job_id, 0, "FAILED", str(exc))

        if not retryable:
            raise PermanentJobError(str(exc)) from exc
        raise  # BullMQ retries with exponential backoff


# ── Graceful shutdown ─────────────────────────────────────────

_shutdown = asyncio.Event()


def _handle_signal(signame: str) -> None:
    logger.info("Shutdown signal received", signal=signame)
    _shutdown.set()


# ── Entry point ───────────────────────────────────────────────

async def main() -> None:
    logger.info(
        "Worker starting",
        queue=QUEUE_NAME,
        redis=f"{settings.redis_host}:{settings.redis_port}",
        storage=settings.storage_local_path,
        timeout_min=settings.job_timeout_seconds // 60,
    )

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, _handle_signal, sig.name)

    worker = Worker(
        QUEUE_NAME,
        process_job,
        {
            "connection": {
                "host": settings.redis_host,
                "port": settings.redis_port,
            }
        },
    )

    logger.info("Worker listening for jobs")
    await _shutdown.wait()

    logger.info("Shutting down gracefully...")
    await worker.close()

    if _db_pool and not _db_pool.closed:
        _db_pool.closeall()

    if _redis_pub:
        _redis_pub.close()

    logger.info("Worker shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())