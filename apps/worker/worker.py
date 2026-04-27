"""
worker.py

Thin entry point. All logic lives in queue/worker.py.
Run with: python worker.py
"""

import asyncio
from job_queue.worker import main

if __name__ == "__main__":
    asyncio.run(main())