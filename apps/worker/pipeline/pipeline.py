import structlog
from typing import List
from .stage import PipelineStage, PipelineContext

logger = structlog.get_logger()


class PipelineBuilder:
    """
    Builder pattern — constructs a pipeline by chaining stages.
    Stages can be added, removed, or reordered without touching the runner.

    Usage:
        pipeline = (
            PipelineBuilder()
            .add_stage(AudioExtractorStage())
            .add_stage(TranscriberStage())
            .add_stage(TranslatorStage())
            .add_stage(SynthesizerStage())
            .add_stage(VideoMergerStage())
            .build()
        )
    """

    def __init__(self):
        self._stages: List[PipelineStage] = []

    def add_stage(self, stage: PipelineStage) -> "PipelineBuilder":
        self._stages.append(stage)
        return self

    def build(self) -> "Pipeline":
        if not self._stages:
            raise ValueError("Pipeline must have at least one stage")
        return Pipeline(list(self._stages))


class Pipeline:
    """
    Executes registered stages in order, passing context through each.
    The runner owns orchestration; stages own logic.
    """

    def __init__(self, stages: List[PipelineStage]):
        self._stages = stages
        self._total = len(stages)

    def run(self, ctx: PipelineContext) -> PipelineContext:
        for i, stage in enumerate(self._stages):
            log = logger.bind(job_id=ctx.job_id, stage=stage.name)
            log.info("Stage starting")

            progress = int((i / self._total) * 90)  # reserve last 10% for completion
            if ctx.progress_callback:
                ctx.progress_callback(progress, stage.name)

            ctx = stage.execute(ctx)
            log.info("Stage complete")

        if ctx.progress_callback:
            ctx.progress_callback(100, "DONE")

        return ctx