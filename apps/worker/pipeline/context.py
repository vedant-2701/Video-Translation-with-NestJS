# pipeline/context.py
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional, Callable


@dataclass
class DiarizedSegment:
    index:      int
    speaker_id: str
    transcript: str
    translated: Optional[str]
    start_time: float   # seconds
    end_time:   float   # seconds

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


@dataclass
class SegmentAudio:
    # Import AudioSegment lazily inside stages that use it
    # to avoid pulling pydub into every file that imports context
    segment: DiarizedSegment
    audio:   object   # pydub.AudioSegment — typed as object to avoid top-level import


@dataclass
class PipelineContext:
    # ── required at init ──────────────────────────────────
    input_video_path: str
    source_language:  str
    target_language:  str

    # ── populated by stages ───────────────────────────────
    audio_path:          Optional[str]   = None
    video_duration:      Optional[float] = None

    # single-speaker path
    transcript:          Optional[str]   = None
    translated_text:     Optional[str]   = None
    tts_audio_path:      Optional[str]   = None

    # diarized path (future)
    diarized_segments:   list            = field(default_factory=list)
    speaker_profiles:    dict            = field(default_factory=dict)
    segment_audios:      list            = field(default_factory=list)
    timeline_audio_path: Optional[str]   = None

    output_video_path:   Optional[str]   = None

    # ── progress callback ─────────────────────────────────
    # Signature: (progress: int, stage: str, message: str) -> None
    # Injected by the queue worker; None in standalone/CLI usage
    progress_callback: Optional[Callable[[int, str, str], None]] = None

    # ── diagnostics ───────────────────────────────────────
    _stage_progress: dict = field(default_factory=dict)
    _timings:        dict = field(default_factory=dict)
    speaker_reference_history: dict = field(default_factory=dict)

    def tick(self, stage: str) -> None:
        self._timings[stage] = time.time()

    def mark_done(self, stage: str, **meta) -> None:
        self._stage_progress[stage] = {
            "status": "done",
            "elapsed": self.elapsed(stage),
            **meta,
        }

    def elapsed(self, stage: str) -> float:
        return round(time.time() - self._timings.get(stage, time.time()), 2)

    def emit_progress(self, progress: int, stage: str, message: str = "") -> None:
        """
        Fire the progress callback if one is registered.
        Stages call this — they do not call the callback directly.
        """
        if self.progress_callback:
            self.progress_callback(progress, stage, message)

    def progress_bar(self, total: int = 5) -> str:
        done = sum(1 for v in self._stage_progress.values() if v.get("status") == "done")
        return f"  [{'█' * done}{'░' * (total - done)}] {done}/{total} stages complete"