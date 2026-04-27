"""
pipeline/utils/audio_stretcher.py

AudioStretcher — fits a TTS audio segment into a target duration slot.

Decision logic (ratio = tts_duration / slot_duration):
  ratio < pad_threshold   → pad end with silence (TTS finished early)
  ratio > wsola_threshold → compress with WSOLA via pytsmod (TTS ran long)
  between                 → use as-is

Used by:
  - MergeVideoStage       (single speaker — fits full TTS to video duration)
  - TimelineBuilderStage  (diarization — fits each segment to its slot)  ← DIARIZATION_HOOK
"""

from __future__ import annotations

import numpy as np
import pytsmod as tsm
from pydub import AudioSegment


class AudioStretcher:

    def __init__(self, pad_threshold: float = 0.85,
                 wsola_threshold: float = 1.15) -> None:
        self._pad   = pad_threshold
        self._wsola = wsola_threshold

    def fit(self, audio: AudioSegment, slot_duration_s: float) -> AudioSegment:
        """
        Adjust audio to fit slot_duration_s.
        Returns a new AudioSegment — input is never mutated.
        """
        tts_s = len(audio) / 1000.0
        ratio = tts_s / slot_duration_s

        print(f"    [Stretcher] TTS={tts_s:.2f}s "
              f"slot={slot_duration_s:.2f}s "
              f"ratio={ratio:.3f}")

        if ratio < self._pad:
            return self._pad_silence(audio, slot_duration_s)
        if ratio > self._wsola:
            return self._wsola_compress(audio, slot_duration_s)

        print("    [Stretcher] ratio in range — using as-is")
        return audio

    # ── private ───────────────────────────────────────────

    def _pad_silence(
        self, audio: AudioSegment, target_s: float
    ) -> AudioSegment:
        silence_ms = int(target_s * 1000) - len(audio)
        print(f"    [Stretcher] Padding {silence_ms}ms silence")
        return audio + AudioSegment.silent(
            duration=silence_ms,
            frame_rate=audio.frame_rate,
        )

    def _wsola_compress(
        self, audio: AudioSegment, target_s: float
    ) -> AudioSegment:
        tts_s        = len(audio) / 1000.0
        speed_factor = tts_s / target_s   # > 1.0 = compress (speed up)
        print(f"    [Stretcher] WSOLA speed_factor={speed_factor:.3f}")

        samples  = np.array(audio.get_array_of_samples()).astype(np.float32)
        # Normalise to [-1, 1]
        samples /= float(2 ** (audio.sample_width * 8 - 1))
        channels = audio.channels
        sr       = audio.frame_rate

        if channels == 2:
            samples = samples.reshape(-1, 2).T     # (2, N)
        else:
            samples = samples.reshape(1, -1)        # (1, N)

        stretched   = tsm.wsola(samples, speed_factor)
        stretched   = np.clip(stretched, -1.0, 1.0)
        int_samples = (
            stretched * float(2 ** (audio.sample_width * 8 - 1))
        ).astype(np.int16)

        if channels == 2:
            int_samples = int_samples.T.flatten()
        else:
            int_samples = int_samples.flatten()

        return AudioSegment(
            int_samples.tobytes(),
            frame_rate=sr,
            sample_width=audio.sample_width,
            channels=channels,
        )