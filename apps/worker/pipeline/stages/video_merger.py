import os
import structlog
import ffmpeg

from pipeline.stage import PipelineStage, PipelineContext

logger = structlog.get_logger()


class VideoMergerStage(PipelineStage):
    """
    Stage 5 — Merge synthesized audio back into the original video using FFmpeg.

    Strategy:
      - Strip the original audio from the video
      - Replace it with the synthesized TTS audio
      - Copy the video stream (no re-encoding = fast + lossless quality)
      - If TTS audio is shorter than video: pad with silence
      - If TTS audio is longer than video: trim to video duration
      - Clean up all temp files after successful merge
    """

    @property
    def name(self) -> str:
        return "VIDEO_MERGE"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)

        self._validate(ctx)

        os.makedirs(os.path.dirname(ctx.output_path), exist_ok=True)

        video_duration = self._get_duration(ctx.input_path)
        audio_duration = self._get_duration(ctx.synthesized_audio_path)

        log.info(
            "Merging audio into video",
            video_duration=round(video_duration, 2),
            audio_duration=round(audio_duration, 2),
            output=ctx.output_path,
        )

        try:
            video_stream = ffmpeg.input(ctx.input_path).video
            audio_stream = ffmpeg.input(ctx.synthesized_audio_path).audio

            # Trim or pad audio to match video duration
            if audio_duration > video_duration:
                # TTS ran long — trim audio to video length
                audio_stream = audio_stream.filter("atrim", duration=video_duration)
                log.info("TTS audio trimmed to match video duration")
            elif audio_duration < video_duration:
                # TTS ran short — pad with silence to video length
                silence = ffmpeg.input("anullsrc", f="lavfi", r=44100, cl="mono")
                audio_stream = ffmpeg.filter(
                    [audio_stream, silence],
                    "concat",
                    n=2,
                    v=0,
                    a=1,
                ).filter("atrim", duration=video_duration)
                log.info("TTS audio padded with silence to match video duration")

            (
                ffmpeg
                .output(
                    video_stream,
                    audio_stream,
                    ctx.output_path,
                    vcodec="copy",       # copy video stream — no re-encode
                    acodec="aac",        # encode audio to AAC for broad compatibility
                    audio_bitrate="192k",
                    shortest=None,       # stop at shortest stream length
                )
                .overwrite_output()
                .run(quiet=True)
            )
        except ffmpeg.Error as e:
            stderr = e.stderr.decode("utf-8") if e.stderr else "unknown ffmpeg error"
            log.error("FFmpeg merge failed", error=stderr)
            raise RuntimeError(f"Video merge failed: {stderr}") from e

        if not os.path.exists(ctx.output_path) or os.path.getsize(ctx.output_path) == 0:
            raise RuntimeError(f"Merge produced no output at: {ctx.output_path}")

        log.info(
            "Video merge complete",
            output=ctx.output_path,
            size_mb=round(os.path.getsize(ctx.output_path) / 1024 / 1024, 2),
        )

        self._cleanup_temp_files(ctx, log)
        return ctx

    def _validate(self, ctx: PipelineContext) -> None:
        if not ctx.synthesized_audio_path or not os.path.exists(ctx.synthesized_audio_path):
            raise RuntimeError(
                f"Synthesized audio not found at: {ctx.synthesized_audio_path!r}. "
                "Did SynthesizerStage run?"
            )
        if not ctx.input_path or not os.path.exists(ctx.input_path):
            raise RuntimeError(f"Input video not found at: {ctx.input_path!r}")

    def _get_duration(self, file_path: str) -> float:
        """Probe media file duration using ffprobe."""
        try:
            probe = ffmpeg.probe(file_path)
            return float(probe["format"]["duration"])
        except (ffmpeg.Error, KeyError, ValueError) as e:
            raise RuntimeError(f"Could not probe duration of {file_path}: {e}") from e

    def _cleanup_temp_files(self, ctx: PipelineContext, log) -> None:
        """Remove intermediate temp files after successful merge."""
        temp_files = [ctx.audio_path, ctx.synthesized_audio_path]
        for path in temp_files:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                    log.info("Temp file removed", path=path)
                except OSError as e:
                    log.warning("Failed to remove temp file", path=path, error=str(e))