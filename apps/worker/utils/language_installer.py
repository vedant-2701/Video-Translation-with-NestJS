"""
Language package installer for ArgosTranslate.

Run this once at container startup (or as a setup script) to pre-download
all required language pairs. This avoids first-job delays.

Usage:
    python -m utils.language_installer en es
    python -m utils.language_installer en fr de es ja zh
"""

import sys
import structlog
from argostranslate import package as argos_package

logger = structlog.get_logger()


def install_language_pair(source: str, target: str) -> None:
    """Download and install an ArgosTranslate language pair."""
    installed = argos_package.get_installed_packages()
    already = any(p.from_code == source and p.to_code == target for p in installed)

    if already:
        logger.info("Language pair already installed", source=source, target=target)
        return

    logger.info("Downloading language package", source=source, target=target)
    argos_package.update_package_index()
    available = argos_package.get_available_packages()

    pkg = next(
        (p for p in available if p.from_code == source and p.to_code == target),
        None,
    )

    if pkg is None:
        logger.error(
            "Language pair not available in ArgosTranslate",
            source=source,
            target=target,
            available_pairs=[(p.from_code, p.to_code) for p in available],
        )
        raise RuntimeError(f"No ArgosTranslate package for {source!r} → {target!r}")

    argos_package.install_from_path(pkg.download())
    logger.info("Language package installed", source=source, target=target)


def install_pairs(pairs: list[tuple[str, str]]) -> None:
    for source, target in pairs:
        install_language_pair(source, target)


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        print("Usage: python -m utils.language_installer <source_lang> <target_lang> [target_lang2 ...]")
        print("Example: python -m utils.language_installer en es")
        sys.exit(1)

    source_lang = args[0]
    target_langs = args[1:]

    for tgt in target_langs:
        install_language_pair(source_lang, tgt)

    logger.info("All language packages ready")