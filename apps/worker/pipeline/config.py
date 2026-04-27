# pipeline/config.py
from __future__ import annotations

from typing import Optional
from pydantic import Field
from pydantic_settings import BaseSettings


class PipelineConfig(BaseSettings):
    """
    All pipeline configuration.
    Values can be overridden via environment variables (uppercase).
    E.g. SARVAM_API_KEY=... VOICEBOX_URL=...
    """

    # ── Sarvam — required ─────────────────────────────────
    sarvam_api_key: str = Field(..., env="SARVAM_API_KEY")

    # ── Language ──────────────────────────────────────────
    source_language: str = Field("en-IN", env="SOURCE_LANGUAGE")
    target_language: str = Field("hi-IN", env="TARGET_LANGUAGE")

    # ── STT ───────────────────────────────────────────────
    stt_model: str = Field("saaras:v3", env="STT_MODEL")
    min_duration_for_batch: int = Field(20, env="MIN_DURATION_FOR_BATCH")

    # ── Translation ───────────────────────────────────────
    translation_mode: str = Field("modern-colloquial", env="TRANSLATION_MODE")

    # ── TTS — Sarvam Bulbul (default / fallback) ──────────
    tts_speaker: str = Field("anushka", env="TTS_SPEAKER")

    # ── TTS — Voicebox (optional voice cloning) ───────────
    voicebox_url: Optional[str] = Field(None, env="VOICEBOX_URL")
    voicebox_engine: str = Field("chatterbox", env="VOICEBOX_ENGINE")
    voicebox_retry_attempts: int = Field(3, env="VOICEBOX_RETRY_ATTEMPTS")
    voicebox_fallback_to_bulbul: bool = Field(False, env="VOICEBOX_FALLBACK_TO_BULBUL")
    voicebox_poll_interval_s: int = Field(5, env="VOICEBOX_POLL_INTERVAL_S")
    voicebox_timeout_s: int = Field(300, env="VOICEBOX_TIMEOUT_S")

    # ── Audio stretching ──────────────────────────────────
    tempo_pad_threshold: float = Field(0.85, env="TEMPO_PAD_THRESHOLD")
    tempo_wsola_threshold: float = Field(1.15, env="TEMPO_WSOLA_THRESHOLD")

    # ── I/O ───────────────────────────────────────────────
    output_dir: str = Field("./storage/outputs", env="STORAGE_OUTPUT_PATH")
    work_dir: Optional[str] = Field(None, env="WORK_DIR")

    # ── FFmpeg ────────────────────────────────────────────
    audio_sample_rate: int = Field(16000, env="AUDIO_SAMPLE_RATE")
    audio_channels: int = Field(1, env="AUDIO_CHANNELS")

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def use_voice_cloning(self) -> bool:
        return self.voicebox_url is not None

    def use_batch_stt(self, video_duration: float) -> bool:
        return video_duration >= self.min_duration_for_batch