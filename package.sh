#!/usr/bin/env bash
#
# Builds the zip to upload to the Chrome Web Store:
#   dist/focus-finder-<version>.zip
#
# Only the files the extension needs at runtime are included. When you add a
# file the extension loads, add it to FILES below.

set -euo pipefail
cd "$(dirname "$0")"

FILES=(
    manifest.json
    shortcut.js
    focus.js
    styles.css
    settings.html
    settings.css
    settings.js
    icons/icon-16.png
    icons/icon-32.png
    icons/icon-48.png
    icons/icon-128.png
)

for file in "${FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
        echo "error: missing $file" >&2
        exit 1
    fi
done

version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' manifest.json | head -n 1)
if [[ -z "$version" ]]; then
    echo "error: could not read version from manifest.json" >&2
    exit 1
fi

out="dist/focus-finder-$version.zip"
mkdir -p dist
rm -f "$out"
zip -q -X "$out" "${FILES[@]}"

echo "Built $out"
