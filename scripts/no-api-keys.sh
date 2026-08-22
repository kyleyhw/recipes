#!/usr/bin/env bash
# Refuses a commit that contains an API key, by shape.
#
# detect-secrets already runs on every commit and is the general answer. This is
# the specific one, and it exists because the general answer has two ways of not
# being there: the hook repos are fetched from GitHub, so a machine that cannot
# reach GitHub installs nothing, and `pre-commit install` is per-clone, so a
# fresh clone has no hooks at all until somebody remembers.
#
# This needs no network, no Python and no baseline. It matches the shapes the
# keys this project actually uses are issued in:
#
#   AIza…      Google / Gemini, 39 characters
#   sk-ant-…   Anthropic
#
# It reads the files git is about to commit, not the working tree, so a key in
# an ignored .env is not its business — that file is never staged.
set -uo pipefail

patterns='AIza[0-9A-Za-z_-]{35}|sk-ant-[0-9A-Za-z_-]{20,}'
found=0

for file in "$@"; do
  [ -f "$file" ] || continue
  if lines=$(grep -InE "$patterns" -- "$file" | cut -d: -f1); then
    # Line numbers only, never the matched text. Printing the line to prove a
    # key leaked would leak it again, into a terminal and any CI log — which is
    # a mistake this file made on its first draft.
    for line in $lines; do
      echo "API key found at $file:$line"
    done
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo
  echo "Refusing to commit. Move the key into .env, which is gitignored."
  exit 1
fi
