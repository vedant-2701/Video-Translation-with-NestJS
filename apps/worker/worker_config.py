# worker_config.py
from pydantic import Field
from pydantic_settings import BaseSettings


class WorkerSettings(BaseSettings):
    """
    Infrastructure config for the BullMQ worker.
    Separate from PipelineConfig so pipeline stays portable.
    """
    redis_host: str = Field("localhost", env="REDIS_HOST")
    redis_port: int = Field(6379, env="REDIS_PORT")

    database_url: str = Field(..., env="DATABASE_URL")

    storage_local_path: str = Field("./storage", env="STORAGE_LOCAL_PATH")

    # Per-job timeout in seconds; slightly less than BullMQ-side timeout
    job_timeout_seconds: int = Field(1800, env="JOB_TIMEOUT_SECONDS")  # 30 min

    class Config:
        env_file = ".env"
        extra = "ignore"


worker_settings = WorkerSettings()