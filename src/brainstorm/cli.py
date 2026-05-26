"""Command-line entry point for the brainstorm dialogue engine."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence

from src.brainstorm.dialogue import TurnGenerator, run


def _default_output_path() -> str:
    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    return f"./.brainstorm/brainstorm-{timestamp}.json"


def _max_rounds_type(value: str) -> int:
    n = int(value)
    if not 1 <= n <= 5:
        raise argparse.ArgumentTypeError("max_rounds must be between 1 and 5")
    return n


def _critic_temperature_type(value: str) -> float:
    f = float(value)
    if not 0.0 <= f <= 1.0:
        raise argparse.ArgumentTypeError(
            "critic_temperature must be between 0.0 and 1.0"
        )
    return f


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="brainstorm",
        description="Multi-turn brainstorming dialogue with MiniMax-M2.7-highspeed.",
    )
    parser.add_argument("--prompt", required=True, help="Problem statement.")
    parser.add_argument(
        "--claude-thoughts",
        required=True,
        help="Seed analysis from Claude (the calling agent).",
    )
    parser.add_argument(
        "--max-rounds",
        type=_max_rounds_type,
        default=3,
        help="Number of dialogue rounds (1-5). Default: 3.",
    )
    parser.add_argument(
        "--output",
        default=_default_output_path(),
        help="Path to write the JSON transcript.",
    )
    parser.add_argument(
        "--critique",
        action="store_true",
        help="Enable the critic voice (3 turns per round; 3N total turns).",
    )
    parser.add_argument(
        "--critic-temperature",
        type=_critic_temperature_type,
        default=0.3,
        help="Temperature for the critic call (default 0.3; range 0.0-1.0).",
    )
    return parser.parse_args(argv)


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    generator: Optional[TurnGenerator] = None,
    critic_generator: Optional[TurnGenerator] = None,
) -> int:
    args = parse_args(argv)

    if generator is None:
        generator = _build_production_generator()

    # Resolve critic config.
    if args.critique:
        if critic_generator is None:
            critic_generator = _build_production_generator()
        from src.brainstorm.argdown_client import LightweightArgdownClient
        argdown_client = LightweightArgdownClient()
    else:
        critic_generator = None
        argdown_client = None

    try:
        transcript = run(
            prompt=args.prompt,
            claude_thoughts=args.claude_thoughts,
            max_rounds=args.max_rounds,
            generator=generator,
            critic_generator=critic_generator,
            argdown_client=argdown_client,
            critic_temperature=args.critic_temperature,
        )
    except Exception as exc:  # API errors bubble up here.
        print(f"brainstorm: error during dialogue: {exc}", file=sys.stderr)
        return 1

    # Compute critique_aggregate when in critique mode.
    if args.critique:
        critic_turns = [t for t in transcript["turns"] if t["speaker"] == "critic"]
        transcript["critique_aggregate"] = {
            "rounds_critiqued": len(critic_turns),
            "rounds_with_critic_unavailable": sum(
                1 for t in critic_turns if t.get("status") == "unavailable"
            ),
            "total_arguments_in": sum(
                len(t.get("dung_extension", {}).get("in", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
            "total_arguments_out": sum(
                len(t.get("dung_extension", {}).get("out", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
            "total_arguments_undec": sum(
                len(t.get("dung_extension", {}).get("undec", []))
                for t in critic_turns if t.get("status") == "ok"
            ),
        }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(transcript, indent=2))
    print(str(output_path))
    return 0


def _build_production_generator() -> TurnGenerator:
    """Build the live MiniMax-backed TurnGenerator.

    Uses the anthropic SDK pointed at the MiniMax-compatible /anthropic endpoint
    (see src.utils.config.Config).
    """
    import anthropic

    from src.utils.config import Config

    client = anthropic.Anthropic(
        api_key=Config.MINIMAX_API_KEY,
        base_url=Config.MINIMAX_BASE_URL,
    )
    model = Config.MINIMAX_MODEL

    def generate(system: str, messages: list[dict], temperature: float) -> str:
        response = client.messages.create(
            model=model,
            max_tokens=1500,
            temperature=temperature,
            system=system,
            messages=messages,
        )
        return "".join(
            block.text for block in response.content
            if hasattr(block, "type") and block.type == "text"
        )

    return generate


if __name__ == "__main__":
    sys.exit(main())
