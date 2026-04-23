import structlog
from argostranslate import package as argos_package
from argostranslate import translate as argos_translate

from pipeline.stage import PipelineStage, PipelineContext

logger = structlog.get_logger()

# Strategy interface for translation backends.
# Lets us swap ArgosTranslate for another engine without touching the stage.
class TranslationStrategy:
    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        raise NotImplementedError


class ArgosTranslationStrategy(TranslationStrategy):
    """
    Uses ArgosTranslate — fully offline, no API key, no cost.

    Language packages are downloaded on first use and cached locally.
    Subsequent translations reuse the cached packages.
    """

    def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        self._ensure_package_installed(source_lang, target_lang)

        installed_languages = argos_translate.get_installed_languages()

        source = next(
            (lang for lang in installed_languages if lang.code == source_lang), None
        )
        target = next(
            (lang for lang in installed_languages if lang.code == target_lang), None
        )

        if source is None:
            raise RuntimeError(
                f"ArgosTranslate: source language '{source_lang}' not installed. "
                f"Installed: {[l.code for l in installed_languages]}"
            )
        if target is None:
            raise RuntimeError(
                f"ArgosTranslate: target language '{target_lang}' not installed. "
                f"Installed: {[l.code for l in installed_languages]}"
            )

        translation = source.get_translation(target)
        if translation is None:
            raise RuntimeError(
                f"No translation path found from '{source_lang}' to '{target_lang}'. "
                "Install the correct ArgosTranslate package."
            )

        return translation.translate(text)

    def _ensure_package_installed(self, source_lang: str, target_lang: str) -> None:
        """
        Auto-downloads the required language package if not already installed.
        Downloads happen once — subsequent calls are instant.
        """
        installed = argos_package.get_installed_packages()
        already_installed = any(
            p.from_code == source_lang and p.to_code == target_lang
            for p in installed
        )

        if already_installed:
            return

        logger.info(
            "Downloading ArgosTranslate language package",
            source=source_lang,
            target=target_lang,
        )

        argos_package.update_package_index()
        available = argos_package.get_available_packages()

        pkg = next(
            (p for p in available if p.from_code == source_lang and p.to_code == target_lang),
            None,
        )

        if pkg is None:
            raise RuntimeError(
                f"ArgosTranslate has no package for '{source_lang}' → '{target_lang}'. "
                f"Check https://github.com/argosopentech/argos-translate for supported pairs."
            )

        argos_package.install_from_path(pkg.download())
        logger.info("Language package installed", source=source_lang, target=target_lang)


class TranslatorStage(PipelineStage):
    """
    Stage 3 — Translate transcript using the injected TranslationStrategy.

    Defaults to ArgosTranslate (offline, free).
    To swap engines: pass a different TranslationStrategy implementation.
    Zero changes needed in this class or the pipeline.
    """

    def __init__(self, strategy: TranslationStrategy | None = None):
        self._strategy = strategy or ArgosTranslationStrategy()

    @property
    def name(self) -> str:
        return "TRANSLATION"

    def execute(self, ctx: PipelineContext) -> PipelineContext:
        log = logger.bind(job_id=ctx.job_id)

        if not ctx.transcript:
            raise RuntimeError("Transcript is empty. Did TranscriberStage run?")

        log.info(
            "Translating text",
            source=ctx.source_language,
            target=ctx.target_language,
            chars=len(ctx.transcript),
        )

        translated = self._strategy.translate(
            text=ctx.transcript,
            source_lang=ctx.source_language,
            target_lang=ctx.target_language,
        )

        if not translated:
            raise RuntimeError("Translation produced an empty result.")

        ctx.translated_text = translated
        log.info(
            "Translation complete",
            chars=len(translated),
            preview=translated[:80] + "..." if len(translated) > 80 else translated,
        )
        return ctx