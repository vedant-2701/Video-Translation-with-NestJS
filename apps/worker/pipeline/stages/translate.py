# """
# pipeline/stages/translate.py

# Stage 3: Translate transcript using Sarvam Translate.
# Mode is configurable via PipelineConfig.translation_mode:
#   - "modern-colloquial"  (default — natural, everyday language)
#   - "classic-colloquial" (more formal)
# """

# from __future__ import annotations

# from sarvamai import SarvamAI

# from pipeline.config import PipelineConfig
# from pipeline.context import PipelineContext
# from pipeline.stages.base import Stage


# class TranslateStage(Stage):
#     name = "stage_3_translate_text"

#     def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
#         self._config = config
#         self._client = client

#     def run(self, ctx: PipelineContext) -> PipelineContext:
#         ctx.tick(self.name)
#         print(f"\n[Stage 3/5] Translate {ctx.source_language} → {ctx.target_language}…")

#         result = self._client.text.translate(
#             input=ctx.transcript,
#             source_language_code=ctx.source_language,
#             target_language_code=ctx.target_language,
#             mode=self._config.translation_mode,
#         )

#         translated = getattr(result, "translated_text", None)
#         if not translated or not translated.strip():
#             raise RuntimeError(
#                 "[Stage 3] Translation returned empty result. "
#                 "Check the language pair is supported by Sarvam Translate."
#             )

#         ctx.translated_text = translated.strip()
#         ctx.mark_done(self.name, chars=len(ctx.translated_text))
#         print(f"  Translation ({len(ctx.translated_text)} chars):")
#         preview = ctx.translated_text[:200]
#         suffix  = "…" if len(ctx.translated_text) > 200 else ""
#         print(f"  {preview}{suffix}")
#         return ctx

"""
pipeline/stages/translate.py

Stage 3: TranslateStage — translates ctx.transcript → ctx.translated_text.

Model auto-selection based on translation_mode:
  formal              → sarvam-translate:v1 (2000 char limit, all 22 langs)
  modern-colloquial   → mayura:v1           (1000 char limit, 12 langs)
  classic-colloquial  → mayura:v1
  code-mixed          → mayura:v1

Batching: splits at segment boundaries when text exceeds model char limit.

DIARIZATION_HOOK:
  For diarized path, use run_batch(segments) instead of run(ctx).
  run_batch() accepts list[DiarizedSegment], translates all in minimal
  API calls using |||SEG_N||| delimiter, returns updated segments.
  No changes needed in this file — just call the right method from pipeline.py.
"""

from __future__ import annotations

import re

from sarvamai import SarvamAI

from pipeline.config import PipelineConfig
from pipeline.context import PipelineContext
from pipeline.stages.base import Stage


# ── Model constants ───────────────────────────────────────────────────────────

_MAYURA           = "mayura:v1"
_SARVAM_TRANSLATE = "sarvam-translate:v1"
_MAYURA_LIMIT     = 1000
_SARVAM_LIMIT     = 2000
_FORMAL_MODES     = {"formal"}   # only these use sarvam-translate


class TranslateStage(Stage):
    name = "stage_3_translate_text"

    def __init__(self, config: PipelineConfig, client: SarvamAI) -> None:
        self._config = config
        self._client = client
        self._model, self._limit = self._resolve_model(config.translation_mode)
        print(f"  [Translate] model={self._model} "
              f"mode={config.translation_mode} "
              f"char_limit={self._limit}")

    # ── single speaker path (current) ────────────────────

    def run(self, ctx: PipelineContext) -> PipelineContext:
        ctx.tick(self.name)
        print(f"\n[Stage 3/5] Translate "
              f"{ctx.source_language} → {ctx.target_language}…")

        ctx.translated_text = self._translate_text(ctx.transcript)

        ctx.mark_done(self.name, chars=len(ctx.translated_text))
        preview = ctx.translated_text[:200]
        suffix  = "…" if len(ctx.translated_text) > 200 else ""
        print(f"  Translation ({len(ctx.translated_text)} chars):")
        print(f"  {preview}{suffix}")
        return ctx

    # ── DIARIZATION_HOOK: batch path ──────────────────────
    # Call this from pipeline.py instead of run() for diarized segments.
    # Signature: run_batch(segments: list[DiarizedSegment]) -> list[DiarizedSegment]
    #
    # def run_batch(self, segments):
    #     texts   = [s.transcript for s in segments]
    #     results = self._translate_segments(texts)
    #     if len(results) != len(segments):
    #         raise RuntimeError(
    #             f"[Translate] Segment count mismatch: "
    #             f"expected {len(segments)}, got {len(results)}"
    #         )
    #     for seg, translated in zip(segments, results):
    #         seg.translated = translated
    #     return segments

    # ── core translation ──────────────────────────────────

    def _translate_text(self, text: str) -> str:
        if len(text) <= self._limit:
            return self._api_call(text)
        # Split into sentences, batch under limit
        sentences = re.split(r"(?<=[.!?])\s+", text)
        batches   = self._batch_by_chars(sentences)
        return " ".join(self._api_call(b) for b in batches)

    def _translate_segments(self, texts: list[str]) -> list[str]:
        """
        Pack segments with |||SEG_N||| delimiter.
        Batches at segment boundaries to stay under char limit.
        Hard asserts count match after parsing.
        """
        batches = self._build_segment_batches(texts)
        results = []

        for batch_texts, batch_indices in batches:
            payload = "\n".join(
                f"|||SEG_{i + 1}||| {t}"
                for i, t in zip(batch_indices, batch_texts)
            )
            raw    = self._api_call(payload)
            parsed = re.split(r"\|\|\|\s*SEG_\d+\s*\|\|\|", raw)
            parsed = [p.strip() for p in parsed if p.strip()]

            if len(parsed) != len(batch_texts):
                raise RuntimeError(
                    f"[Translate] Delimiter parse failed in batch. "
                    f"Expected {len(batch_texts)}, got {len(parsed)}.\n"
                    f"Raw response:\n{raw}"
                )
            results.extend(parsed)

        return results

    def _build_segment_batches(
        self, texts: list[str]
    ) -> list[tuple[list[str], list[int]]]:
        batches: list[tuple[list[str], list[int]]] = []
        cur_texts:   list[str] = []
        cur_indices: list[int] = []
        cur_len = 0

        for i, text in enumerate(texts):
            overhead  = len(f"|||SEG_{i + 1}||| \n")
            entry_len = len(text) + overhead
            if cur_texts and cur_len + entry_len > self._limit:
                batches.append((cur_texts, cur_indices))
                cur_texts, cur_indices, cur_len = [], [], 0
            cur_texts.append(text)
            cur_indices.append(i)
            cur_len += entry_len

        if cur_texts:
            batches.append((cur_texts, cur_indices))
        return batches

    def _batch_by_chars(self, sentences: list[str]) -> list[str]:
        batches, cur, cur_len = [], [], 0
        for s in sentences:
            if cur and cur_len + len(s) + 1 > self._limit:
                batches.append(" ".join(cur))
                cur, cur_len = [], 0
            cur.append(s)
            cur_len += len(s) + 1
        if cur:
            batches.append(" ".join(cur))
        return batches

    def _api_call(self, text: str) -> str:
        result = self._client.text.translate(
            input=text,
            source_language_code=self._config.source_language,
            target_language_code=self._config.target_language,
            mode=self._config.translation_mode,
            model=self._model,
        )
        translated = getattr(result, "translated_text", None)
        if not translated:
            raise RuntimeError("[Translate] Empty response from Sarvam API")
        return translated.strip()

    @staticmethod
    def _resolve_model(mode: str) -> tuple[str, int]:
        if mode in _FORMAL_MODES:
            return _SARVAM_TRANSLATE, _SARVAM_LIMIT
        return _MAYURA, _MAYURA_LIMIT