import logging
import sys

from app.core.config import get_settings


def setup_logging() -> None:
    """Configure root logger based on app environment."""
    settings = get_settings()

    level = logging.DEBUG if settings.app_debug else logging.INFO

    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )

    # Silence noisy third-party loggers in production
    if not settings.app_debug:
        logging.getLogger("httpx").setLevel(logging.WARNING)
        logging.getLogger("openai").setLevel(logging.WARNING)


logger = logging.getLogger("my_gpt_api")
