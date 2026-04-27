from __future__ import annotations

import tempfile

from sarvamai import SarvamAI

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.tts import build_tts_strategy
from pipeline.stages import (
    ExtractAudioStage,
    SmartSTTStage,
    TranslateStage,
    TextToSpeechStage,
    MergeVideoStage,
)


class VideoTranslationPipeline:
    """
    Orchestrates the 5-stage video translation pipeline.

    Usage:
        config = PipelineConfig(
            sarvam_api_key="...",
            source_language="en-IN",
            target_language="hi-IN",
            voicebox_url="https://xxxx.ngrok-free.app",   # optional
            translation_mode="modern-colloquial",
        )
        pipeline = VideoTranslationPipeline(config)
        output   = pipeline.run("input.mp4")
    """

    def __init__(self, config: PipelineConfig) -> None:
        self._config   = config
        self._work_dir = config.work_dir or tempfile.mkdtemp(prefix="vidtrans_")
        self._sarvam   = SarvamAI(api_subscription_key=config.sarvam_api_key)
        self._stages   = self._build_stages(config)

    def _build_stages(self, config: PipelineConfig) -> list:
        tts_strategy = build_tts_strategy(config, self._sarvam)
        return [
            ExtractAudioStage(config, self._work_dir),
            SmartSTTStage(config, self._sarvam),
            TranslateStage(config, self._sarvam),
            TextToSpeechStage(config, tts_strategy, self._work_dir),
            MergeVideoStage(config),
            # DIARIZATION_HOOK:
            # Replace TextToSpeechStage + MergeVideoStage with:
            #   VoiceProfileBuilderStage(config, self._work_dir)  ← parallel
            #   DiarizedTTSStage(config, voicebox, bulbul, self._work_dir)
            #   TimelineBuilderStage(config, self._work_dir)
            #   MergeVideoStage(config)   ← unchanged, reads timeline_audio_path
        ]

    def run(self, input_video_path: str) -> str:
        """Run with a fresh context (no progress callback). CLI/standalone use."""
        ctx = PipelineContext(
            input_video_path=input_video_path,
            source_language=self._config.source_language,
            target_language=self._config.target_language,
        )
        return self._run_with_context(ctx)

    def _run_with_context(self, ctx: PipelineContext) -> str:
        """
        Run all stages with a pre-built context.
        Called by queue worker to inject the progress callback.
        """
        total = len(self._stages)

        for i, stage in enumerate(self._stages):
            start_pct = int((i / total) * 95)
            ctx.emit_progress(start_pct, stage.name, f"Starting {stage.name}")

            stage.run(ctx)
            print(f"  {ctx.progress_bar()}")

            done_pct = int(((i + 1) / total) * 95)
            ctx.emit_progress(done_pct, stage.name, f"Completed {stage.name}")

        ctx.emit_progress(100, "DONE", "Pipeline complete")
        print(f"\n✅ Pipeline complete → {ctx.output_video_path}")
        return ctx.output_video_path