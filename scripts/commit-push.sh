#!/usr/bin/env bash
# Stage everything, commit it with the given message, and push.
#
#   scripts/commit-push.sh "Your commit message"
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: $0 \"commit message\"" >&2
  exit 1
fi

git add -A

if git diff --cached --quiet; then
  echo "Nothing to commit." >&2
  exit 1
fi

git commit -m "$1"
git push
