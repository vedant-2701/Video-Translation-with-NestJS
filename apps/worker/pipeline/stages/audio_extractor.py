import os
import structlog
import ffmpeg

from pipeline.stage import PipelineStage, PipelineContext

logger = structlog.get_logger()


class AudioExtractorStage(PipelineStage):
    """
    Stage 1 — Extract audio from video using FFmpeg.

    Converts whatever audio track is in the video into a
    16kHz mono WAV file — the exact format Whisper expects.
    Stores the audio path on the context for the next stage.
    """

    @property
    def name(self) -> str:
        return "AUDIO_EXTRACTION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)
        log.info("Extracting audio", input_path=ctx.input_path)

        audio_path = self._derive_audio_path(ctx)

        try:
            (
                ffmpeg
                .input(ctx.input_path)
                .output(
                    audio_path,
                    ac=1,          # mono channel
                    ar=16000,      # 16kHz sample rate (Whisper requirement)
                    acodec="pcm_s16le",  # uncompressed WAV
                    vn=None,       # strip video stream
                )
                .overwrite_output()
                .run(quiet=True)
            )
        except ffmpeg.Error as e:
            stderr = e.stderr.decode("utf-8") if e.stderr else "unknown ffmpeg error"
            log.error("FFmpeg audio extraction failed", error=stderr)
            raise RuntimeError(f"Audio extraction failed: {stderr}") from e

        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            raise RuntimeError(f"Audio extraction produced no output at: {audio_path}")

        ctx.audio_path = audio_path
        log.info("Audio extracted", audio_path=audio_path, size_kb=os.path.getsize(audio_path) // 1024)
        return ctx

    def _derive_audio_path(self, ctx: PipelineContext) -> str:
        """Place the temp audio file in the temp/ folder beside the input video."""
        temp_dir = os.path.join(ctx.storage_root, "temp")
        os.makedirs(temp_dir, exist_ok=True)
        base = os.path.splitext(os.path.basename(ctx.input_path))[0]
        return os.path.join(temp_dir, f"{base}.wav")