"""
pipeline/tts/sarvam.py

SarvamTTSStrategy — Sarvam Bulbul v3 TTS.
Preset speaker voice, no voice cloning.

Supported target languages:
  hi-IN, bn-IN, ta-IN, te-IN, kn-IN,
  ml-IN, mr-IN, gu-IN, pa-IN, od-IN
"""

from __future__ import annotations

import base64

from sarvamai import SarvamAI

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.tts.base import TTSStrategy


class SarvamTTSStrategy(TTSStrategy):

    SUPPORTED_LANGUAGES = {
        "hi-IN", "bn-IN", "ta-IN", "te-IN", "kn-IN",
        "ml-IN", "mr-IN", "gu-IN", "pa-IN", "od-IN",
    }

    def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
        self._config = config
        self._client = client

    def synthesize(self, ctx: PipelineContext, output_path: str) -> str:
        lang = ctx.target_language
        if lang not in self.SUPPORTED_LANGUAGES:
            print(f"  [Bulbul] {lang!r} not supported — falling back to hi-IN")
            lang = "hi-IN"

        response = self._client.text_to_speech.convert(
            text=ctx.translated_text,
            target_language_code=lang,
            speaker=self._config.tts_speaker,
        )
        audio_bytes = self._extract_audio(response)
        with open(output_path, "wb") as f:
            f.write(audio_bytes)
        return output_path

    # Also callable directly with raw text (used by diarized path fallback)
    def synthesize_text(
        self, text: str, target_language_code: str, output_path: str
    ) -> str:
        lang = target_language_code
        if lang not in self.SUPPORTED_LANGUAGES:
            lang = "hi-IN"
        response = self._client.text_to_speech.convert(
            text=text,
            target_language_code=lang,
            speaker=self._config.tts_speaker,
        )
        audio_bytes = self._extract_audio(response)
        with open(output_path, "wb") as f:
            f.write(audio_bytes)
        return output_path

    @staticmethod
    def _extract_audio(response) -> bytes:
        if hasattr(response, "audios") and response.audios:
            parts = []
            for chunk in response.audios:
                parts.append(
                    base64.b64decode(chunk)
                    if isinstance(chunk, str) else bytes(chunk)
                )
            if parts:
                return b"".join(parts)
        if hasattr(response, "audio"):
            a = response.audio
            return base64.b64decode(a) if isinstance(a, str) else bytes(a)
        raise RuntimeError(
            f"[Bulbul] No audio in response. Fields: {dir(response)}"
        )