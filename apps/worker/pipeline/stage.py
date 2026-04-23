from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable


@dataclass
class PipelineContext:
    """
    Shared state passed through every pipeline stage.
    Each stage reads from and writes to this context.
    """
    job_id: str
    input_path: str          # full path to original video
    output_path: str         # full path where final video will be written
    source_language: str
    target_language: str
    storage_root: str

    # Set by stages as they run
    audio_path: str = ""           # extracted audio (wav)
    transcript: str = ""           # raw transcribed text
    translated_text: str = ""      # translated text
    synthesized_audio_path: str = ""  # TTS output audio

    # Progress callback — worker calls this to emit progress
    progress_callback: Callable[[int, str], None] = None


class PipelineStage(ABC):
    """
    Abstract base for each pipeline stage.
    Follows SRP — one stage = one responsibility.
    """

    @abstractmethod
    def execute(self, ctx: PipelineContext) -> PipelineContext:
        """
        Execute this stage. Receives context, returns updated context.
        Raise an exception to signal failure — the runner handles it.
        """
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable stage name for logging."""
        ...