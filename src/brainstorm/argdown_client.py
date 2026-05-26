"""ArgdownClient protocol and v0.2.0 lightweight production implementation.

The lightweight client does minimal structural validation in pure Python
and returns an empty Dung extension. Real argdown integration (Deno MCP
or Node CLI) is deferred to v0.3.0 per the spec.
"""

import re
from dataclasses import dataclass
from typing import Protocol


@dataclass
class ArgdownParseResult:
    ok: bool
    error: str | None


@dataclass
class DungExtensionResult:
    in_: list[str]  # serializes as "in" (Python keyword conflict)
    out: list[str]
    undec: list[str]


class ArgdownClient(Protocol):
    def parse(self, source: str) -> ArgdownParseResult: ...
    def dung_extensions(self, source: str) -> DungExtensionResult: ...


_LABELED_ARGUMENT_RE = re.compile(r"^\[[^\]]+\]\s*:", re.MULTILINE)


class LightweightArgdownClient:
    """Production v0.2.0 ArgdownClient.

    Checks that the source contains at least one labeled argument ([Name]:).
    Returns an empty Dung extension — argdown is captured in the transcript
    but algebraic analysis is deferred to v0.3.0.
    """

    def parse(self, source: str) -> ArgdownParseResult:
        if not _LABELED_ARGUMENT_RE.search(source):
            return ArgdownParseResult(
                ok=False,
                error="no labeled arguments found (expected at least one [Name]: ...)",
            )
        return ArgdownParseResult(ok=True, error=None)

    def dung_extensions(self, source: str) -> DungExtensionResult:
        # source is intentionally unused in v0.2.0 — real Dung-extension
        # computation is deferred to v0.3.0. The parameter is part of the
        # Protocol contract and must remain in the signature.
        return DungExtensionResult(in_=[], out=[], undec=[])
