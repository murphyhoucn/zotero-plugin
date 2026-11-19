#!/usr/bin/env bash
#
# Build the DEV XPI of plugins/annotate-pdf with the self-test channel
# injected (scripts/dev/dev-selftest.js -> chrome/content/dev-selftest.js).
# The release build (scripts/build.sh) never contains the dev channel.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLUGIN="$ROOT/plugins/annotate-pdf"
SELFTEST="$ROOT/scripts/dev/dev-selftest.js"
OUT="$ROOT/dist"

[ -f "$PLUGIN/manifest.json" ] || { echo "plugin not found: $PLUGIN" >&2; exit 1; }
[ -f "$SELFTEST" ] || { echo "self-test file not found: $SELFTEST" >&2; exit 1; }

version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$PLUGIN/manifest.json" | head -n 1)"
if [ -z "$version" ]; then
	echo "cannot read version from $PLUGIN/manifest.json" >&2
	exit 1
fi

mkdir -p "$OUT"
xpi="$OUT/annotate-pdf-dev-${version}.xpi"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

cp -R "$PLUGIN"/. "$stage"/
cp "$SELFTEST" "$stage/chrome/content/dev-selftest.js"

rm -f "$xpi"
(
	cd "$stage"
	zip -r -X "$xpi" . \
		-x 'README.md' \
		-x 'CHANGELOG.md' \
		-x 'update.json' \
		-x '.git*' \
		-x '*.DS_Store' \
		-x '*.xpi' >/dev/null
)
echo "built: $xpi"
