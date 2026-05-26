"""Tests for the LightweightArgdownClient (v0.2.0 production)."""

from src.brainstorm.argdown_client import (
    ArgdownParseResult,
    DungExtensionResult,
    LightweightArgdownClient,
)


def test_lightweight_parse_accepts_text_with_labeled_argument():
    client = LightweightArgdownClient()
    result = client.parse("[A]: claude said something\n  -> [B]: pragmatist countered")
    assert result.ok is True
    assert result.error is None


def test_lightweight_parse_rejects_text_without_labeled_argument():
    client = LightweightArgdownClient()
    result = client.parse("just some prose with no labeled arguments")
    assert result.ok is False
    assert "no labeled arguments" in result.error.lower()


def test_lightweight_parse_rejects_empty_string():
    client = LightweightArgdownClient()
    result = client.parse("")
    assert result.ok is False


def test_lightweight_dung_extensions_returns_empty_partition():
    """v0.2.0 ships without real Dung-extension computation; field is captured but empty."""
    client = LightweightArgdownClient()
    result = client.dung_extensions("[A]: anything\n  -> [B]: another")
    assert result.in_ == []
    assert result.out == []
    assert result.undec == []


def test_lightweight_parse_rejects_prose_with_inline_bracket_label():
    """Bracket-followed-by-colon mid-sentence is not valid argdown.

    Argdown requires labeled arguments at the start of a line; the lightweight
    regex enforces this via re.MULTILINE anchoring.
    """
    client = LightweightArgdownClient()
    result = client.parse("Earlier the spec said: see [RFC 2119]: for normative terms")
    assert result.ok is False
    assert "no labeled arguments" in result.error.lower()


def test_lightweight_parse_accepts_argument_on_second_line():
    """Multi-line argdown with the first labeled argument on line 2 is valid."""
    client = LightweightArgdownClient()
    result = client.parse("# Argument graph\n[A]: claude's claim\n  -> [B]: pragmatist objection")
    assert result.ok is True
