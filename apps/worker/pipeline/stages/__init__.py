"""
Pipeline stage stubs.
Each stage is a skeleton with TODO markers for Phase 3 implementation.
All stages follow the same interface: execute(ctx) -> ctx
"""

import structlog
from .stage import PipelineStage, PipelineContext

logger = structlog.get_logger()


class AudioExtractorStage(PipelineStage):
    """Stage 1 — Extract audio track from video using FFmpeg."""

    @property
    def name(self) -> str:
        return "AUDIO_EXTRACTION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Extracting audio", input=ctx.input_path)

        # TODO (Phase 3): implement FFmpeg audio extraction
        # import ffmpeg
        # audio_path = ctx.input_path.replace(".mp4", ".wav")
        # ffmpeg.input(ctx.input_path).output(audio_path, ac=1, ar=16000).run()
        # ctx.audio_path = audio_path

        log.info("Audio extraction stub complete")
        return ctx


class TranscriberStage(PipelineStage):
    """Stage 2 — Transcribe audio to text using Whisper (local)."""

    @property
    def name(self) -> str:
        return "TRANSCRIPTION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Transcribing audio", lang=ctx.source_language)

        # TODO (Phase 3): implement Whisper transcription
        # import whisper
        # model = whisper.load_model("base")
        # result = model.transcribe(ctx.audio_path, language=ctx.source_language)
        # ctx.transcript = result["text"]

        log.info("Transcription stub complete")
        return ctx


class TranslatorStage(PipelineStage):
    """Stage 3 — Translate transcript using ArgosTranslate (offline, free)."""

    @property
    def name(self) -> str:
        return "TRANSLATION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Translating", src=ctx.source_language, tgt=ctx.target_language)

        # TODO (Phase 3): implement ArgosTranslate
        # from argostranslate import package, translate
        # installed = translate.get_installed_languages()
        # src = next(l for l in installed if l.code == ctx.source_language)
        # tgt = next(l for l in installed if l.code == ctx.target_language)
        # translation = src.get_translation(tgt)
        # ctx.translated_text = translation.translate(ctx.transcript)

        log.info("Translation stub complete")
        return ctx


class SynthesizerStage(PipelineStage):
    """Stage 4 — Synthesize translated text to audio using Coqui TTS (free, local)."""

    @property
    def name(self) -> str:
        return "SYNTHESIS"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Synthesizing speech", lang=ctx.target_language)

        # TODO (Phase 3): implement Coqui TTS
        # from TTS.api import TTS
        # tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2")
        # output_audio = ctx.input_path.replace(".mp4", "-tts.wav")
        # tts.tts_to_file(text=ctx.translated_text, language=ctx.target_language, file_path=output_audio)
        # ctx.synthesized_audio_path = output_audio

        log.info("Synthesis stub complete")
        return ctx


class VideoMergerStage(PipelineStage):
    """Stage 5 — Merge synthesized audio back into original video using FFmpeg."""

    @property
    def name(self) -> str:
        return "VIDEO_MERGE"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Merging audio into video", output=ctx.output_path)

        # TODO (Phase 3): implement FFmpeg merge
        # import ffmpeg
        # video = ffmpeg.input(ctx.input_path).video
        # audio = ffmpeg.input(ctx.synthesized_audio_path).audio
        # ffmpeg.output(video, audio, ctx.output_path, vcodec="copy").run()

        log.info("Video merge stub complete")
        return ctx