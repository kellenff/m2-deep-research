"""Configuration management for Deep Research Agent."""

import os
import anthropic
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Configuration class for managing API keys and settings."""

    # Minimax API Configuration
    MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY")
    MINIMAX_BASE_URL = "https://api.minimax.io/anthropic"

    # Exa API Configuration
    EXA_API_KEY = os.getenv("EXA_API_KEY")
    EXA_BASE_URL = "https://api.exa.ai"

    # Cache for the resolved MiniMax model identifier (lazy, set by minimax_model())
    _resolved_model: str | None = None

    @classmethod
    def minimax_model(cls) -> str:
        """Return the active MiniMax model identifier.

        First call probes ``MiniMax-M2.7-highspeed``; on capability denial
        (HTTP 403/404/422), falls back to ``MiniMax-M2.7``. Auth errors and
        5xx propagate so the caller sees the real failure. Subsequent calls
        return the cached identifier.
        """
        if cls._resolved_model is not None:
            return cls._resolved_model

        client = anthropic.Anthropic(
            api_key=cls.MINIMAX_API_KEY,
            base_url=cls.MINIMAX_BASE_URL,
        )

        try:
            client.messages.create(
                model="MiniMax-M2.7-highspeed",
                max_tokens=1,
                messages=[{"role": "user", "content": "ok"}],
            )
            cls._resolved_model = "MiniMax-M2.7-highspeed"
            print(f"resolved model: {cls._resolved_model}")
        except anthropic.APIStatusError as e:
            if e.status_code in (403, 404, 422):
                cls._resolved_model = "MiniMax-M2.7"
                print(
                    f"resolved model: {cls._resolved_model} "
                    f"(fallback: HTTP {e.status_code} on highspeed probe)"
                )
            else:
                raise

        return cls._resolved_model

    @classmethod
    def validate(cls):
        """Validate that all required API keys are set."""
        missing = []

        if not cls.MINIMAX_API_KEY:
            missing.append("MINIMAX_API_KEY")
        if not cls.EXA_API_KEY:
            missing.append("EXA_API_KEY")

        if missing:
            raise ValueError(
                f"Missing required API keys: {', '.join(missing)}. "
                f"Please set them in your .env file."
            )

        return True


# Validate configuration on import
try:
    Config.validate()
except ValueError as e:
    print(f"Configuration Error: {e}")
    print("Please copy .env.example to .env and fill in your API keys.")
