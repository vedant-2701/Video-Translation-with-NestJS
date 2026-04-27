"""
pipeline/tts/voicebox.py

VoiceboxTTSStrategy — voice cloning via Voicebox REST API.
Engine: chatterbox (supports Hindi and other Indic languages).
Engine: qwen does NOT support Hindi.

Single-speaker flow (synthesize):
  1. POST /profiles              → create uniquely-named profile
  2. POST /profiles/{id}/samples → upload full audio + transcript as reference
  3. POST /generate              → queue generation
  4. GET  /history/{id}          → poll until completed
  5. GET  /audio/{id}            → fetch binary WAV
  6. DELETE /profiles/{id}       → cleanup

DIARIZATION_HOOK:
  DiarizedTTSStage calls _queue(), _poll(), _fetch() directly
  for batched concurrent control. Those methods are intentionally
  kept as separate public-ish methods (single underscore) so
  DiarizedTTSStage can access them without going through synthesize().
  No changes needed in this file when diarization is added.
"""

from __future__ import annotations

import time
import uuid

import requests
from typing import Optional
from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.tts.base import TTSStrategy


class VoiceboxTTSStrategy(TTSStrategy):

    _HEADERS = {"ngrok-skip-browser-warning": "true"}

    def __init__(self, config: PipelineConfig) -> None:
        self._config   = config
        self._base_url = config.voicebox_url.rstrip("/")

    # ── TTSStrategy interface (single speaker) ────────────

    def synthesize(self, ctx: PipelineContext, output_path: str) -> str:
        profile_id = self._create_profile()
        try:
            self._upload_sample(
                profile_id,
                ctx.audio_path,
                ctx.transcript,
            )
            gen_id = self._queue(profile_id, ctx.translated_text,
                                 ctx.target_language.split("-")[0])
            self._poll(gen_id)
            self._fetch(gen_id, output_path)
        finally:
            self._delete_profile(profile_id)
        return output_path

    # ── Profile management ────────────────────────────────

    def _create_profile(self, speaker_label: str = "pipeline") -> str:
        name = f"{speaker_label}_{uuid.uuid4().hex[:8]}"
        r = requests.post(
            f"{self._base_url}/profiles",
            json={"name": name, "language": "en", "voice_type": "cloned"},
            timeout=30,
        )
        r.raise_for_status()
        profile_id = r.json()["id"]
        print(f"  [Voicebox] Profile created → {profile_id}")
        return profile_id

    def _upload_sample(
        self, profile_id: str, audio_path: str, reference_text: str
    ) -> None:
        with open(audio_path, "rb") as f:
            r = requests.post(
                f"{self._base_url}/profiles/{profile_id}/samples",
                files={"file": ("reference.wav", f, "audio/wav")},
                data={"reference_text": reference_text},
                timeout=60,
            )

            print(r.json())
        r.raise_for_status()
        print("  [Voicebox] Sample uploaded ✅")

    def _delete_profile(self, profile_id: str) -> None:
        try:
            requests.delete(
                f"{self._base_url}/profiles/{profile_id}",
                timeout=10,
            )
            print(f"  [Voicebox] Profile {profile_id} deleted ✅")
        except Exception as e:
            print(f"  [Voicebox] Profile cleanup failed (non-fatal): {e}")

    # ── Generation — split into 3 steps for diarized reuse ─

    def _queue(self, profile_id: str, text: str, lang: str) -> str:
        """Submit generation request. Returns gen_id immediately."""
        r = requests.post(
            f"{self._base_url}/generate",
            json={
                "profile_id": profile_id,
                "text": text,
                "language": lang,
                "engine": self._config.voicebox_engine,
            },
            timeout=180,
        )
        r.raise_for_status()
        gen_id = r.json()["id"]
        print(f"  [Voicebox] Generation queued → {gen_id}")
        return gen_id

    def _poll(
        self,
        gen_id: str,
        interval: Optional[int] = None,
        timeout: Optional[int] = None,
    ) -> None:
        """Poll until completed or failed. Raises on failure or timeout."""
        interval     = interval or self._config.voicebox_poll_interval_s
        timeout      = timeout or self._config.voicebox_timeout_s
        max_attempts = timeout // interval

        for attempt in range(int(max_attempts)):
            try:
                r      = requests.get(
                    f"{self._base_url}/history/{gen_id}",
                    headers=self._HEADERS,
                    timeout=15,
                )
                data   = r.json()
                status = data.get("status")
                print(f"  [Voicebox] [{attempt + 1}] status={status}")

                if status == "completed":
                    return
                if status == "failed":
                    raise RuntimeError(
                        f"[Voicebox] Generation failed: {data.get('error')}"
                    )
            except (requests.exceptions.SSLError,
                    requests.exceptions.ConnectionError) as e:
                print(f"  [Voicebox] Network error attempt {attempt + 1}: {e}")

            time.sleep(interval)

        raise RuntimeError(
            f"[Voicebox] Generation timed out after {timeout}s"
        )

    def _fetch(self, gen_id: str, output_path: str) -> None:
        """Fetch generated audio binary and write to output_path."""
        r = requests.get(
            f"{self._base_url}/audio/{gen_id}",
            headers=self._HEADERS,
            timeout=180,
        )
        if r.status_code != 200:
            raise RuntimeError(
                f"[Voicebox] Audio fetch failed {r.status_code}: {r.text[:200]}"
            )
        with open(output_path, "wb") as f:
            f.write(r.content)
