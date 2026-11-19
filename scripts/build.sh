#!/usr/bin/env bash
#
# Build every plugin under plugins/ into dist/<name>-<version>.xpi
#
# Requirements: zip
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist"
mkdir -p "$OUT"

built=0
for dir in "$ROOT"/plugins/*/; do
	[ -f "${dir}manifest.json" ] || continue

	name="$(basename "$dir")"
	version="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${dir}manifest.json" | head -n 1)"
	if [ -z "$version" ]; then
		echo "cannot read version from ${dir}manifest.json" >&2
		exit 1
	fi
	xpi="$OUT/${name}-${version}.xpi"

	rm -f "$xpi"
	(
		cd "$dir"
		zip -r -X "$xpi" . \
			-x 'README.md' \
			-x 'CHANGELOG.md' \
			-x 'update.json' \
			-x '.git*' \
			-x '*.DS_Store' \
			-x '*.xpi' >/dev/null
	)
	echo "built: $xpi"
	built=$((built + 1))
done

if [ "$built" -eq 0 ]; then
	echo "no plugins found under $ROOT/plugins" >&2
	exit 1
fi
