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
    return parser.parse_args(argv)


def main(
    argv: Optional[Sequence[str]] = None,
    *,
    generator: Optional[TurnGenerator] = None,
) -> int:
    args = parse_args(argv)

    if generator is None:
        generator = _build_production_generator()

    try:
        transcript = run(
            prompt=args.prompt,
            claude_thoughts=args.claude_thoughts,
            max_rounds=args.max_rounds,
            generator=generator,
        )
    except Exception as exc:  # API errors bubble up here.
        print(f"brainstorm: error during dialogue: {exc}", file=sys.stderr)
        return 1

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(transcript, indent=2))
    print(str(output_path))
    return 0


def _build_production_generator() -> TurnGenerator:
    """Build the live MiniMax-backed TurnGenerator. See Task 8."""
    raise NotImplementedError(
        "Production generator not wired yet; pass generator= explicitly."
    )


if __name__ == "__main__":
    sys.exit(main())
