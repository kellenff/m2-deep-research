#!/usr/bin/env python3
"""Repo-root shim for the brainstorm CLI.

Run via: `uv run python brainstorm.py --prompt ... --claude-thoughts ...`
"""

import sys

from src.brainstorm.cli import main

if __name__ == "__main__":
    sys.exit(main())
