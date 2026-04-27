# """
# pipeline/stages/text_to_speech.py

# Stage 4: Convert translated text to speech using the configured TTS strategy.
# This stage is strategy-agnostic — it calls synthesize() and handles file validation.
# Switching TTS engines requires zero changes here.
# """

# from __future__ import annotations

# import os

# from pipeline.config import PipelineConfig
# from pipeline.context import PipelineContext
# from pipeline.stages.base import Stage
# from pipeline.tts.sarvam import TTSStrategy


# class TextToSpeechStage(Stage):
#     name = "stage_4_text_to_speech"

#     def __init__(self, config: PipelineConfig, strategy: TTSStrategy, work_dir: str) -> None:
#         self._config   = config
#         self._strategy = strategy
#         self._work_dir = work_dir

#     def run(self, ctx: PipelineContext) -> PipelineContext:
#         ctx.tick(self.name)
#         strategy_name = type(self._strategy).__name__
#         print(f"\n[Stage 4/5] TTS via {strategy_name}…")

#         out = os.path.join(self._work_dir, "tts_output.wav")
#         self._strategy.synthesize(ctx, out)

#         if not os.path.exists(out) or os.path.getsize(out) == 0:
#             raise RuntimeError(f"[Stage 4] TTS output is empty: {out}")

#         ctx.tts_audio_path = out
#         size_kb = os.path.getsize(out) // 1024
#         ctx.mark_done(self.name, size_kb=size_kb)
#         print(f"  → {out}  ({size_kb} KB, {ctx.elapsed(self.name)}s)")
#         return ctx


"""
pipeline/stages/text_to_speech.py

Stage 4: TextToSpeechStage — single speaker TTS.

Delegates entirely to whichever TTSStrategy is injected.
If strategy is VoiceboxTTSStrategy, creates and cleans up
a voice profile using the extracted audio as reference.

DIARIZATION_HOOK:
  For multi-speaker diarized path, this stage is replaced by
  DiarizedTTSStage (stages/diarized_tts.py — add when needed).
  This file remains unchanged for the single-speaker path.
"""

from __future__ import annotations

import os

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.stages.base import Stage
from pipeline.tts.base import TTSStrategy


class TextToSpeechStage(Stage):
    name = "stage_4_text_to_speech"

    def __init__(
        self,
        config: PipelineConfig,
        strategy: TTSStrategy,
        work_dir: str,
    ) -> None:
        self._config   = config
        self._strategy = strategy
        self._work_dir = work_dir

    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.name)
        strategy_name = type(self._strategy).__name__
        print(f"\n[Stage 4/5] TTS via {strategy_name}…")

        out = os.path.join(self._work_dir, "tts_output.wav")
        self._strategy.synthesize(ctx, out)

        if not os.path.exists(out) or os.path.getsize(out) == 0:
            raise RuntimeError(f"[Stage 4] TTS output is empty: {out}")

        ctx.tts_audio_path = out
        size_kb = os.path.getsize(out) // 1024
        ctx.mark_done(self.name, size_kb=size_kb)
        print(f"  → {out}  ({size_kb} KB, {ctx.elapsed(self.name)}s)")
        return ctx