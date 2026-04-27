"""
pipeline/tts/base.py

TTSStrategy — abstract interface all TTS backends implement.

synthesize(ctx, output_path) must:
  - Read translated text and language from ctx
  - Write a valid WAV file to output_path
  - Return output_path

DIARIZATION_HOOK:
  DiarizedTTSStage does NOT use synthesize() — it calls
  VoiceboxTTSStrategy._queue(), _poll(), _fetch() directly
  for fine-grained control over batching and polling.
  TTSStrategy interface is only for single-speaker path.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pipeline.context import PipelineContext


class TTSStrategy(ABC):

    @abstractmethod
    def synthesize(self, ctx: PipelineContext, output_path: str) -> str:
        """Synthesize speech, write WAV to output_path, return output_path."""