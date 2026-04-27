# """
# pipeline/tts/__init__.py

# Factory function — resolves which TTS strategy to use based on config.
# Add new strategies here. Nothing else in the codebase needs to change.
# """

# from __future__ import annotations

# from sarvamai import SarvamAI

# from pipeline.config import PipelineConfig
# from pipeline.tts.sarvam import TTSStrategy, SarvamTTSStrategy
# from pipeline.tts.voicebox import VoiceboxTTSStrategy

# __all__ = ["TTSStrategy", "SarvamTTSStrategy", "VoiceboxTTSStrategy", "build_tts_strategy"]


# def build_tts_strategy(config: PipelineConfig, sarvam_client: SarvamAI) -> TTSStrategy:
#     """
#     Resolve TTS strategy from config.

#     Rules:
#       - voicebox_url set → VoiceboxTTSStrategy (voice cloning, Chatterbox engine)
#       - voicebox_url not set → SarvamTTSStrategy (Bulbul v3, preset speaker)

#     To add a new strategy: implement TTSStrategy, add a branch here.
#     """
#     if config.use_voice_cloning:
#         print(f"[TTS] Strategy → VoiceboxTTSStrategy (engine={config.voicebox_engine})")
#         return VoiceboxTTSStrategy(config)

#     print(f"[TTS] Strategy → SarvamTTSStrategy (speaker={config.tts_speaker})")
#     return SarvamTTSStrategy(config, sarvam_client)

"""
pipeline/tts/__init__.py

Factory — resolves which TTS strategy to use from config.
Adding a new strategy = implement TTSStrategy, add one branch here.
"""

from __future__ import annotations

from sarvamai import SarvamAI

from pipeline.config import PipelineConfig
from pipeline.tts.base import TTSStrategy
from pipeline.tts.sarvam import SarvamTTSStrategy
from pipeline.tts.voicebox import VoiceboxTTSStrategy

__all__ = [
    "TTSStrategy",
    "SarvamTTSStrategy",
    "VoiceboxTTSStrategy",
    "build_tts_strategy",
]


def build_tts_strategy(
    config: PipelineConfig, sarvam_client: SarvamAI
) -> TTSStrategy:
    """
    Resolves TTS strategy from config.

    voicebox_url set → VoiceboxTTSStrategy (voice cloning, chatterbox)
    voicebox_url not set → SarvamTTSStrategy (Bulbul v3, preset speaker)

    To add a new strategy:
      1. Implement TTSStrategy in a new file under tts/
      2. Add a branch here
      3. Add config fields if needed
    """
    if config.use_voice_cloning:
        print(f"[TTS] Strategy → Voicebox "
              f"(engine={config.voicebox_engine}, "
              f"retry={config.voicebox_retry_attempts}, "
              f"fallback={config.voicebox_fallback_to_bulbul})")
        return VoiceboxTTSStrategy(config)

    print(f"[TTS] Strategy → Sarvam Bulbul v3 "
          f"(speaker={config.tts_speaker})")
    return SarvamTTSStrategy(config, sarvam_client)