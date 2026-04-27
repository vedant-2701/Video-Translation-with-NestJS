"""
Logging configuration for the Python worker.

- Development: coloured, human-readable console output
- Production:  JSON lines (Datadog / CloudWatch / Loki ready)

Call configure_logging() once at startup before any logger is created.
"""

import os
import logging
import structlog


def configure_logging() -> None:
    """
    Sets up structlog with shared processors.

    Shared processors run on every log event regardless of renderer:
      - add_log_level     → adds "level" field
      - add_logger_name   → adds "logger" field
      - TimeStamper       → adds "timestamp" in ISO format
      - StackInfoRenderer → renders stack info if present
      - format_exc_info   → renders exception tracebacks

    The renderer at the end switches based on NODE_ENV:
      - dev:  ConsoleRenderer (pretty, coloured)
      - prod: JSONRenderer    (machine-parseable JSON lines)
    """
    is_prod = os.environ.get("PYTHON_ENV", "development") == "production"

    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
    ]

    if is_prod:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.DEBUG if not is_prod else logging.INFO
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Also configure stdlib logging so third-party libs (psycopg2, etc.)
    # emit through structlog
    logging.basicConfig(
        format="%(message)s",
        level=logging.DEBUG if not is_prod else logging.INFO,
    )