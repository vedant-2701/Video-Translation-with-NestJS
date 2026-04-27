"""
pipeline/stages/base.py

Abstract base for all pipeline stages.
Every stage receives a context, does its work, writes results back,
and returns the same context — enabling a clean chain.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from pipeline.context import PipelineContext


class Stage(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Machine-readable stage key used for progress tracking."""

    @abstractmethod
    def run(self, ctx: PipelineContext) -> PipelineContext:
        """Execute the stage. Mutates ctx, returns it."""