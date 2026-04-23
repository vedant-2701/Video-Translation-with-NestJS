from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    redis_host: str = "localhost"
    redis_port: int = 6379
    storage_local_path: str = "./storage"
    database_url: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()