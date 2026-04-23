import os
import structlog
import whisper

from pipeline.stage import PipelineStage, PipelineContext

logger = structlog.get_logger()

# Whisper model sizes: tiny, base, small, medium, large
# tiny  → fastest, least accurate (~39M params)
# base  → good balance for dev (~74M params)
# small → better accuracy, still fast (~244M params)
# Configurable via env so you can upgrade without code changes
DEFAULT_MODEL = os.environ.get("WHISPER_MODEL", "base")

# Module-level cache — model loads once per worker process, not per job
_model_cache: dict[str, whisper.Whisper] = {}


def _load_model(model_name: str) -> whisper.Whisper:
    if model_name not in _model_cache:
        logger.info("Loading Whisper model", model=model_name)
        _model_cache[model_name] = whisper.load_model(model_name)
        logger.info("Whisper model loaded", model=model_name)
    return _model_cache[model_name]


class TranscriberStage(PipelineStage):
    """
    Stage 2 — Transcribe audio to text using OpenAI Whisper (runs 100% locally).

    Whisper auto-detects language if source_language is not provided.
    Segments are joined into a single transcript string and stored on context.

    Model is loaded once and cached — subsequent jobs reuse the loaded model.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL):
        self._model_name = model_name

    @property
    def name(self) -> str:
        return "TRANSCRIPTION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)

        if not ctx.audio_path or not os.path.exists(ctx.audio_path):
            raise RuntimeError(f"Audio file not found at: {ctx.audio_path!r}. Did AudioExtractorStage run?")

        log.info("Transcribing audio", model=self._model_name, language=ctx.source_language or "auto-detect")

        model = _load_model(self._model_name)

        # Pass language only if specified — otherwise Whisper auto-detects
        transcribe_kwargs: dict = {"fp16": False}  # fp16=False for CPU compatibility
        if ctx.source_language:
            transcribe_kwargs["language"] = ctx.source_language

        result = model.transcribe(ctx.audio_path, **transcribe_kwargs)

        transcript = result.get("text", "").strip()

        if not transcript:
            raise RuntimeError("Whisper produced an empty transcript. Check audio quality.")

        ctx.transcript = transcript
        log.info(
            "Transcription complete",
            chars=len(transcript),
            detected_lang=result.get("language"),
            preview=transcript[:80] + "..." if len(transcript) > 80 else transcript,
        )
        return ctx