# """
# pipeline/stages/merge_video.py

# Stage 5: Merge TTS audio back onto the original video using FFmpeg.

# atempo sync:
#   - Probes both durations
#   - Computes atempo = tts_duration / video_duration (clamped 0.5–2.0)
#   - Applies atempo + apad so output always matches original video length
# """

# from __future__ import annotations

# import os
# import subprocess
# from pathlib import Path

# from pipeline.config import PipelineConfig
# from pipeline.context import PipelineContext
# from pipeline.stages.base import Stage


# class MergeVideoStage(Stage):
#     name = "stage_5_merge_audio_video"

#     def __init__(self, config: PipelineConfig) -> None:
#         self._config = config

#     def run(self, ctx: PipelineContext) -> PipelineContext:
#         ctx.tick(self.name)

#         stem = Path(ctx.input_video_path).stem
#         out  = os.path.join(
#             self._config.output_dir,
#             f"{stem}_translated_{ctx.target_language}.mp4",
#         )
#         print(f"\n[Stage 5/5] Merging audio + video → {out}…")

#         video_duration = self._probe_duration(ctx.input_video_path)
#         tts_duration   = self._probe_duration(ctx.tts_audio_path)

#         print(f"  Video duration : {video_duration:.2f}s")
#         print(f"  TTS duration   : {tts_duration:.2f}s")

#         tempo = tts_duration / video_duration
#         tempo = max(0.5, min(2.0, tempo))
#         print(f"  atempo factor  : {tempo:.4f}")

#         cmd = [
#             "ffmpeg", "-y",
#             "-i", ctx.input_video_path,
#             "-i", ctx.tts_audio_path,
#             "-c:v", "copy",
#             "-c:a", "aac",
#             "-map", "0:v:0",
#             "-map", "1:a:0",
#             "-filter:a", f"atempo={tempo},apad",
#             "-t", str(video_duration),
#             out,
#         ]
#         result = subprocess.run(cmd, capture_output=True, text=True)

#         if result.returncode != 0:
#             raise RuntimeError(f"[Stage 5] FFmpeg merge failed:\n{result.stderr}")
#         if not os.path.exists(out) or os.path.getsize(out) == 0:
#             raise RuntimeError("[Stage 5] Output video is empty.")

#         ctx.output_video_path = out
#         size_mb = os.path.getsize(out) / (1024 * 1024)
#         ctx.mark_done(self.name, size_mb=round(size_mb, 2))
#         print(f"  → {out}  ({size_mb:.1f} MB, {ctx.elapsed(self.name)}s)")
#         return ctx

#     @staticmethod
#     def _probe_duration(path: str) -> float:
#         result = subprocess.run(
#             [
#                 "ffprobe", "-v", "error",
#                 "-show_entries", "format=duration",
#                 "-of", "default=noprint_wrappers=1:nokey=1",
#                 path,
#             ],
#             capture_output=True,
#             text=True,
#         )
#         if result.returncode != 0 or not result.stdout.strip():
#             raise RuntimeError(f"[Stage 5] ffprobe failed on {path}:\n{result.stderr}")
#         return float(result.stdout.strip())


"""
pipeline/stages/merge_video.py

Stage 5: MergeVideoStage — merges final audio onto original video.

Single speaker path:
  - Loads tts_audio_path as pydub AudioSegment
  - Applies AudioStretcher (WSOLA or pad) to fit video_duration
  - Exports fitted WAV, merges onto video with FFmpeg

DIARIZATION_HOOK:
  For diarized path, ctx.tts_audio_path will be None and
  ctx.timeline_audio_path will be set by TimelineBuilderStage.
  MergeVideoStage checks which is available — no code change needed
  here when diarization is added, just populate the right context field.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

from pydub import AudioSegment

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.stages.base import Stage
from pipeline.utils.audio_stretcher import AudioStretcher


class MergeVideoStage(Stage):
    name = "stage_5_merge_audio_video"

    def __init__(self, config: PipelineConfig) -> None:
        self._config    = config
        self._stretcher = AudioStretcher(
            pad_threshold=config.tempo_pad_threshold,
            wsola_threshold=config.tempo_wsola_threshold,
        )

    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.name)

        stem = Path(ctx.input_video_path).stem
        out  = os.path.join(
            self._config.output_dir,
            f"{stem}_translated_{ctx.target_language}.mp4",
        )
        print(f"\n[Stage 5/5] Merging audio + video → {out}…")

        final_audio_path = self._prepare_audio(ctx)

        cmd = [
            "ffmpeg", "-y",
            "-i", ctx.input_video_path,
            "-i", final_audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-t", str(ctx.video_duration),
            out,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise RuntimeError(f"[Stage 5] FFmpeg failed:\n{result.stderr}")
        if not os.path.exists(out) or os.path.getsize(out) == 0:
            raise RuntimeError("[Stage 5] Output video is empty.")

        ctx.output_video_path = out
        size_mb = os.path.getsize(out) / (1024 * 1024)
        ctx.mark_done(self.name, size_mb=round(size_mb, 2))
        print(f"  → {out}  ({size_mb:.1f} MB, {ctx.elapsed(self.name)}s)")
        return ctx

    def _prepare_audio(self, ctx: PipelineContext) -> str:
        """
        Returns path to the final audio file ready for FFmpeg.

        DIARIZATION_HOOK:
          If ctx.timeline_audio_path is set (diarized path),
          return it directly — timeline is already duration-matched.
          Otherwise apply AudioStretcher to single-speaker TTS audio.
        """
        # DIARIZATION_HOOK — uncomment when diarization is added:
        # if getattr(ctx, "timeline_audio_path", None):
        #     print("  Using pre-built timeline audio (diarized path)")
        #     return ctx.timeline_audio_path

        # Single speaker path — stretch/pad to match video duration
        print(f"  Video duration : {ctx.video_duration:.2f}s")
        tts_audio = AudioSegment.from_file(ctx.tts_audio_path)
        print(f"  TTS duration   : {len(tts_audio) / 1000:.2f}s")

        fitted      = self._stretcher.fit(tts_audio, ctx.video_duration)
        fitted_path = os.path.join(
            os.path.dirname(ctx.tts_audio_path), "fitted_tts.wav"
        )
        fitted.export(fitted_path, format="wav")
        return fitted_path