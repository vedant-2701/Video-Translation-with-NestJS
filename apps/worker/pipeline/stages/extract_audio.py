# """
# pipeline/stages/extract_audio.py

# Stage 1: Extract audio from input video using FFmpeg.
# Outputs a 16kHz mono PCM WAV file for downstream STT.
# """

# from __future__ import annotations

# import os
# import subprocess

# from pipeline.config import PipelineConfig
# from pipeline.context import PipelineContext
# from pipeline.stages.base import Stage


# class ExtractAudioStage(Stage):
#     name = "stage_1_extract_audio"

#     def __init__(self, config: PipelineConfig, work_dir: str) -> None:
#         self._config   = config
#         self._work_dir = work_dir

#     def run(self, ctx: PipelineContext) -> PipelineContext:
#         ctx.tick(self.name)
#         print("\n[Stage 1/5] Extracting audio (FFmpeg → 16kHz mono WAV)…")

#         out = os.path.join(self._work_dir, "extracted_audio.wav")

#         cmd = [
#             "ffmpeg", "-y",
#             "-i", ctx.input_video_path,
#             "-vn",
#             "-acodec", "pcm_s16le",
#             "-ar", str(self._config.audio_sample_rate),
#             "-ac", str(self._config.audio_channels),
#             out,
#         ]
#         result = subprocess.run(cmd, capture_output=True, text=True)

#         if result.returncode != 0:
#             raise RuntimeError(f"[Stage 1] FFmpeg failed:\n{result.stderr}")
#         if not os.path.exists(out) or os.path.getsize(out) == 0:
#             raise RuntimeError("[Stage 1] Output WAV is empty.")

#         # Probe video duration
#         probe = subprocess.run([
#             'ffprobe', '-v', 'error',
#             '-show_entries', 'format=duration',
#             '-of', 'default=noprint_wrappers=1:nokey=1',
#             ctx.input_video_path,
#         ], capture_output=True, text=True)
#         ctx.video_duration = float(probe.stdout.strip())

#         ctx.audio_path = out
#         ctx.mark_done(stage, path=out, video_duration=ctx.video_duration)
#         print(f'  → {out}  ({ctx.elapsed(stage)}s)')
#         print(f'  Video duration: {ctx.video_duration:.2f}s')
#         return ctx


"""
pipeline/stages/extract_audio.py

Stage 1: ExtractAudioStage — extracts audio from input video using FFmpeg.
Also probes video_duration and writes it to context.
video_duration is used by SmartSTTStage to decide sync vs batch path.
"""

from __future__ import annotations

import os
import subprocess

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.stages.base import Stage


class ExtractAudioStage(Stage):
    name = "stage_1_extract_audio"

    def __init__(self, config: PipelineConfig, work_dir: str) -> None:
        self._config   = config
        self._work_dir = work_dir

    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.name)
        print("\n[Stage 1/5] Extracting audio (FFmpeg → 16kHz mono WAV)…")

        out = os.path.join(self._work_dir, "extracted_audio.wav")

        cmd = [
            "ffmpeg", "-y",
            "-i", ctx.input_video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", str(self._config.audio_sample_rate),
            "-ac", str(self._config.audio_channels),
            out,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"[Stage 1] FFmpeg failed:\n{result.stderr}")
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            raise RuntimeError("[Stage 1] Output WAV is empty.")

        # Probe video duration — needed for STT routing in Stage 2
        probe = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            ctx.input_video_path,
        ], capture_output=True, text=True)

        if probe.returncode != 0 or not probe.stdout.strip():
            raise RuntimeError(
                f"[Stage 1] ffprobe failed:\n{probe.stderr}"
            )

        ctx.audio_path     = out
        ctx.video_duration = float(probe.stdout.strip())
        ctx.mark_done(self.name, path=out,
                      video_duration=ctx.video_duration)
        print(f"  → {out}  ({ctx.elapsed(self.name)}s)")
        print(f"  Video duration: {ctx.video_duration:.2f}s")
        return ctx