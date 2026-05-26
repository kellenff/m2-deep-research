"""Live contract test against the real MiniMax /anthropic endpoint.

Gated behind RUN_LIVE_TESTS=1 to avoid burning tokens in normal CI runs.
Proves that the production TurnGenerator can actually produce the
behavior the collaboration tests stub out.
"""

import json
import os
import subprocess
import sys

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_LIVE_TESTS") != "1",
    reason="Set RUN_LIVE_TESTS=1 to run live MiniMax contract tests.",
)


def test_live_brainstorm_produces_valid_2n_transcript(tmp_path):
    output = tmp_path / "live-transcript.json"

    result = subprocess.run(
        [
            sys.executable, "brainstorm.py",
            "--prompt", "Should a small CLI tool's README lead with code or with concept?",
            "--claude-thoughts", "Leading with code respects skim-reading; leading with concept builds context.",
            "--max-rounds", "2",
            "--output", str(output),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, (
        f"brainstorm.py exited {result.returncode}:\nstderr:\n{result.stderr}"
    )
    assert output.exists(), "transcript file was not created"

    data = json.loads(output.read_text())
    assert data["max_rounds"] == 2
    assert len(data["turns"]) == 4  # 2N for N=2
    speakers = [(t["round"], t["speaker"]) for t in data["turns"]]
    assert speakers == [
        (1, "claude"),
        (1, "pragmatist"),
        (2, "claude"),
        (2, "pragmatist"),
    ]
    # All generated turns must contain non-empty text.
    for turn in data["turns"]:
        assert turn["text"].strip(), f"empty turn: {turn}"
