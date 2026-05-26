"""Tests for the brainstorm CLI."""

import json
import pytest

from src.brainstorm import cli


def test_parse_args_requires_prompt_and_claude_thoughts():
    with pytest.raises(SystemExit):
        cli.parse_args([])


def test_parse_args_defaults_max_rounds_to_3():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.max_rounds == 3


def test_parse_args_rejects_invalid_max_rounds():
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "0",
            "--output", "/tmp/out.json",
        ])
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "6",
            "--output", "/tmp/out.json",
        ])


def test_default_output_path_is_under_dot_brainstorm():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
    ])
    assert args.output.startswith("./.brainstorm/")
    assert args.output.endswith(".json")


def test_main_writes_transcript_to_output_file(tmp_path):
    output = tmp_path / "transcript.json"

    def fake_generator(system, messages, temperature):
        return f"resp-{temperature}"

    exit_code = cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=fake_generator,
    )

    assert exit_code == 0
    assert output.exists()
    data = json.loads(output.read_text())
    assert data["prompt"] == "topic"
    assert data["claude_seed_thoughts"] == "seed"
    assert data["max_rounds"] == 1
    assert len(data["turns"]) == 2  # claude_r1 + pragmatist_r1


def test_main_creates_parent_directory(tmp_path):
    output = tmp_path / "subdir" / "transcript.json"

    def fake_generator(system, messages, temperature):
        return "resp"

    cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=fake_generator,
    )

    assert output.exists()


def test_main_returns_exit_code_1_on_api_error(tmp_path):
    output = tmp_path / "transcript.json"

    def failing_generator(system, messages, temperature):
        raise RuntimeError("simulated API failure")

    exit_code = cli.main(
        argv=[
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--max-rounds", "1",
            "--output", str(output),
        ],
        generator=failing_generator,
    )

    assert exit_code == 1


def test_parse_args_critique_defaults_to_false():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.critique is False


def test_parse_args_critique_flag_sets_true():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--critique",
        "--output", "/tmp/out.json",
    ])
    assert args.critique is True


def test_parse_args_critic_temperature_defaults_to_0_3():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--output", "/tmp/out.json",
    ])
    assert args.critic_temperature == 0.3


def test_parse_args_critic_temperature_accepts_valid_value():
    args = cli.parse_args([
        "--prompt", "topic",
        "--claude-thoughts", "seed",
        "--critic-temperature", "0.5",
        "--output", "/tmp/out.json",
    ])
    assert args.critic_temperature == 0.5


def test_parse_args_critic_temperature_rejects_out_of_range():
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--critic-temperature", "1.5",
            "--output", "/tmp/out.json",
        ])
    with pytest.raises(SystemExit):
        cli.parse_args([
            "--prompt", "topic",
            "--claude-thoughts", "seed",
            "--critic-temperature", "-0.1",
            "--output", "/tmp/out.json",
        ])
