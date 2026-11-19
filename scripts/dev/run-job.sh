#!/usr/bin/env bash
#
# Run a dev self-test job against a running Zotero (dev build of annotate-pdf).
#
# Usage: bash scripts/dev/run-job.sh scripts/dev/tests/annotate-pdf-e2e.js [timeout-seconds]
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
JOB="${1:-}"
TIMEOUT="${2:-120}"

[ -n "$JOB" ] || { echo "usage: $0 <job.js> [timeout-seconds]" >&2; exit 1; }
JOB="$(cd "$(dirname "$JOB")" && pwd)/$(basename "$JOB")"
[ -f "$JOB" ] || { echo "job file not found: $JOB" >&2; exit 1; }

# Zotero's self-test channel reads PathUtils.tempDir (= the Windows %TEMP%),
# not Git Bash's /tmp, so write the job to %TEMP% explicitly.
TMP_POSIX="${TEMP:-${TMP:-${TMPDIR:-/tmp}}}"
if command -v cygpath >/dev/null 2>&1; then
	TMP_POSIX="$(cygpath -u "$TMP_POSIX" 2>/dev/null || echo "$TMP_POSIX")"
fi
JOB_PATH="$TMP_POSIX/annotate-pdf-job.js"
RESULT_PATH="$TMP_POSIX/annotate-pdf-result.json"

if [ ! -f "$TMP_POSIX/annotate-pdf-channel.txt" ]; then
	echo "warning: annotate-pdf dev channel marker not found ($TMP_POSIX/annotate-pdf-channel.txt)" >&2
fi

rm -f "$RESULT_PATH"
cp "$JOB" "$JOB_PATH"

deadline=$(( $(date +%s) + TIMEOUT ))
while [ ! -f "$RESULT_PATH" ]; do
	if [ "$(date +%s)" -ge "$deadline" ]; then
		echo "timed out waiting for $RESULT_PATH" >&2
		exit 1
	fi
	sleep 1
done
cat "$RESULT_PATH"
