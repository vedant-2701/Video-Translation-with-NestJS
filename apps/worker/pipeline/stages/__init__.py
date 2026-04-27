# from .extract_audio import ExtractAudioStage
# from .speech_to_text import SpeechToTextStage
# from .translate import TranslateStage
# from .text_to_speech import TextToSpeechStage
# from .merge_video import MergeVideoStage

# __all__ = [
#     "ExtractAudioStage",
#     "SpeechToTextStage",
#     "TranslateStage",
#     "TextToSpeechStage",
#     "MergeVideoStage",
# ]

from .extract_audio import ExtractAudioStage
from .speech_to_text import SmartSTTStage
from .translate import TranslateStage
from .text_to_speech import TextToSpeechStage
from .merge_video import MergeVideoStage

__all__ = [
    "ExtractAudioStage",
    "SmartSTTStage",
    "TranslateStage",
    "TextToSpeechStage",
    "MergeVideoStage",
]

# DIARIZATION_HOOK:
# When adding diarization, import and export these too:
# from .diarized_tts import DiarizedTTSStage
# from .timeline_builder import TimelineBuilderStage
# from .profile_builder import VoiceProfileBuilderStage