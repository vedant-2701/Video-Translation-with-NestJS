import os
import structlog
from TTS.api import TTS

from pipeline.stage import PipelineStage, PipelineContext

logger = structlog.get_logger()

# XTTS v2 is Coqui's best multilingual model — free and local.
# Supports 17 languages out of the box.
# Model is cached after first download (~1.8 GB).
TTS_MODEL = os.environ.get("TTS_MODEL", "tts_models/multilingual/multi-dataset/xtts_v2")

# Supported language codes for XTTS v2
XTTS_SUPPORTED_LANGUAGES = {
    "en", "es", "fr", "de", "it", "pt", "pl", "tr",
    "ru", "nl", "cs", "ar", "zh", "ja", "hu", "ko", "hi",
}

# Module-level cache — TTS model loads once per worker process
_tts_cache: TTS | None = None


def _load_tts() -> TTS:
    global _tts_cache
    if _tts_cache is None:
        logger.info("Loading Coqui TTS model", model=TTS_MODEL)
        _tts_cache = TTS(model_name=TTS_MODEL, progress_bar=False)
        logger.info("TTS model loaded")
    return _tts_cache


class SynthesizerStage(PipelineStage):
    """
    Stage 4 — Convert translated text to speech using Coqui XTTS v2.

    XTTS v2 is a multilingual TTS model that runs entirely locally.
    It can optionally clone the voice from the original audio (speaker_wav)
    to keep the output voice similar to the original speaker.

    Voice cloning is used if ctx.audio_path exists (extracted in Stage 1).
    Falls back to default voice if not available.
    """

    @property
    def name(self) -> str:
        return "SYNTHESIS"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)

        if not ctx.translated_text:
            raise RuntimeError("Translated text is empty. Did TranslatorStage run?")

        target_lang = self._normalize_language(ctx.target_language)
        self._validate_language(target_lang)

        output_audio_path = self._derive_output_path(ctx)
        os.makedirs(os.path.dirname(output_audio_path), exist_ok=True)

        tts = _load_tts()

        log.info(
            "Synthesizing speech",
            language=target_lang,
            chars=len(ctx.translated_text),
            voice_clone=bool(ctx.audio_path),
        )

        tts_kwargs: dict = {
            "text": ctx.translated_text,
            "language": target_lang,
            "file_path": output_audio_path,
        }

        # Voice cloning: use original audio as reference if available
        if ctx.audio_path and os.path.exists(ctx.audio_path):
            tts_kwargs["speaker_wav"] = ctx.audio_path
            log.info("Voice cloning enabled", reference=ctx.audio_path)

        tts.tts_to_file(**tts_kwargs)

        if not os.path.exists(output_audio_path) or os.path.getsize(output_audio_path) == 0:
            raise RuntimeError(f"TTS produced no output at: {output_audio_path}")

        ctx.synthesized_audio_path = output_audio_path
        log.info(
            "Speech synthesis complete",
            output=output_audio_path,
            size_kb=os.path.getsize(output_audio_path) // 1024,
        )
        return ctx

    def _normalize_language(self, lang: str) -> str:
        """Normalize language codes like 'en-US' → 'en'."""
        return lang.split("-")[0].lower()

    def _validate_language(self, lang: str) -> None:
        if lang not in XTTS_SUPPORTED_LANGUAGES:
            raise RuntimeError(
                f"TTS language '{lang}' is not supported by XTTS v2. "
                f"Supported: {sorted(XTTS_SUPPORTED_LANGUAGES)}"
            )

    def _derive_output_path(self, ctx: PipelineContext) -> str:
        temp_dir = os.path.join(ctx.storage_root, "temp")
        os.makedirs(temp_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(ctx.input_path))[0]
        return os.path.join(temp_dir, f"{base}-synthesized.wav")