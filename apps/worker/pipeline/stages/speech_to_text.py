# """
# pipeline/stages/speech_to_text.py

# Stage 2: Transcribe audio using Sarvam Saaras v3.
# Writes the transcript into context for use by Stage 3 (translation)
# and Stage 4 (voice cloning reference text).
# """

# from __future__ import annotations

# from sarvamai import SarvamAI

# from pipeline.config import PipelineConfig
# from pipeline.context import PipelineContext
# from pipeline.stages.base import Stage


# class SpeechToTextStage(Stage):
#     name = "stage_2_speech_to_text"

#     def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
#         self._config = config
#         self._client = client

#     def run(self, ctx: PipelineContext) -> PipelineContext:
#         ctx.tick(self.name)
#         print("\n[Stage 2/5] Speech-to-Text (Sarvam Saaras v3)…")

#         with open(ctx.audio_path, "rb") as f:
#             result = self._client.speech_to_text_job.transcribe(
#                 file=f,
#                 model=self._config.stt_model,
#             )

#         transcript = getattr(result, "transcript", None)
#         if not transcript or not transcript.strip():
#             raise RuntimeError(
#                 "[Stage 2] Empty transcript. "
#                 "Verify the audio contains speech and the language is supported."
#             )

#         ctx.transcript = transcript.strip()
#         ctx.mark_done(self.name, chars=len(ctx.transcript))
#         print(f"  Transcript ({len(ctx.transcript)} chars):")
#         preview = ctx.transcript[:200]
#         suffix  = "…" if len(ctx.transcript) > 200 else ""
#         print(f"  {preview}{suffix}")
#         return ctx

"""
pipeline/stages/speech_to_text.py

Stage 2: SmartSTTStage — routes to sync or batch STT based on video duration.

  < min_duration_for_batch seconds → SyncSTT  (single REST call, fast)
  >= min_duration_for_batch seconds → BatchSTT (job API, handles long audio)

DIARIZATION_HOOK:
  BatchSTT currently runs with_diarization=False.
  To enable diarization:
    1. Set config.with_diarization = True
    2. BatchSTTStage will return diarized_transcript entries
    3. Slot DiarizedSTTParser stage after this one in pipeline.py
    4. Add DiarizedSegment population to context
  No changes needed in this file — just the config flag and pipeline routing.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

from sarvamai import SarvamAI

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.stages.base import Stage


class SmartSTTStage(Stage):
    """
    Routes to sync or batch STT based on video_duration vs config threshold.
    video_duration is populated by ExtractAudioStage (Stage 1).
    """

    name = "stage_2_speech_to_text"

    def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
        self._config = config
        self._client = client
        self._sync  = _SyncSTT(config, client)
        self._batch = _BatchSTT(config, client)

    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.name)

        if ctx.video_duration is None:
            raise RuntimeError(
                "[Stage 2] video_duration not set. "
                "ExtractAudioStage must run before SmartSTTStage."
            )

        # if self._config.use_batch_stt(ctx.video_duration):
        #     print(f"\n[Stage 2/5] STT — batch job "
        #           f"(duration={ctx.video_duration:.1f}s "
        #           f">= {self._config.min_duration_for_batch}s)…")
        #     self._batch.run(ctx)
        # else:
        #     print(f"\n[Stage 2/5] STT — sync "
        #           f"(duration={ctx.video_duration:.1f}s "
        #           f"< {self._config.min_duration_for_batch}s)…")
        #     self._sync.run(ctx)

        self._batch.run(ctx)  # for testing, run batch STT regardless of duration

        ctx.mark_done(self.name, chars=len(ctx.transcript or ""))
        preview = (ctx.transcript or "")[:200]
        suffix  = "…" if len(ctx.transcript or "") > 200 else ""
        print(f"  Transcript ({len(ctx.transcript or '')} chars):")
        print(f"  {preview}{suffix}")
        return ctx


# ── Internal implementations — not exposed outside this file ──────────────────

class _SyncSTT:
    """Single REST call — fast, for short videos."""

    def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
        self._config = config
        self._client = client

    def run(self, ctx: PipelineContext) -> None:
        with open(ctx.audio_path, "rb") as f:
            result = self._client.speech_to_text.transcribe(
                file=f,
                model=self._config.stt_model,
            )
        transcript = getattr(result, "transcript", None)
        if not transcript or not transcript.strip():
            raise RuntimeError(
                "[Stage 2 / Sync] Empty transcript. "
                "Verify audio has speech and language is supported."
            )
        ctx.transcript = transcript.strip()


class _BatchSTT:
    """
    Batch job API — handles long audio files.
    with_diarization=False by default.

    DIARIZATION_HOOK:
      Change to with_diarization=True and parse
      result['diarized_transcript']['entries'] in pipeline.py
      after this stage completes.
    """

    def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
        self._config = config
        self._client = client

    def run(self, ctx: PipelineContext) -> None:
        job = self._client.speech_to_text_job.create_job(
            model=self._config.stt_model,
            language_code=self._config.source_language,
            mode="transcribe",
            with_diarization=False,   # DIARIZATION_HOOK: set True to enable
            with_timestamps=True,
        )
        job.upload_files(file_paths=[ctx.audio_path])
        job.start()
        print("  [BatchSTT] Job started — waiting for completion…")
        job.wait_until_complete()

        out_dir = tempfile.mkdtemp(prefix="stt_out_")
        job.download_outputs(output_dir=out_dir)

        result_file = next(Path(out_dir).glob("*.json"))
        with open(result_file) as f:
            data = json.load(f)
        
        print(f"  [BatchSTT] Job completed. Result file: {data}")

        transcript = data.get("transcript", "").strip()
        if not transcript:
            raise RuntimeError(
                "[Stage 2 / Batch] Empty transcript in job output. "
                f"Result file: {result_file}"
            )
        ctx.transcript = transcript