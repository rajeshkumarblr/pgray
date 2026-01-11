#!/bin/bash

set -euo pipefail

# Generate a filename with a timestamp (e.g., pgray_source_20231027_1200.zip)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PKG_DIR="pkg"
OUTPUT_FILE="pgray_source_${TIMESTAMP}.zip"
OUTPUT_PATH="${PKG_DIR}/${OUTPUT_FILE}"
LATEST_LINK="${PKG_DIR}/pgray.zip"

mkdir -p "${PKG_DIR}"

echo "📦 Packaging source code into ${OUTPUT_PATH}..."

# Build an explicit file list so we only include source (for LLM context)
FILES=()

# Backend: all Python sources
while IFS= read -r -d '' f; do FILES+=("$f"); done < <(find backend -type f -name '*.py' -print0)

# Frontend: source tree
if [[ -d frontend/src ]]; then
  while IFS= read -r -d '' f; do FILES+=("$f"); done < <(find frontend/src -type f -print0)
fi

# Frontend: small, helpful entry/config files (keep minimal)
for f in frontend/index.html frontend/vite.config.ts frontend/package.json frontend/tsconfig.json frontend/tsconfig.node.json; do
  [[ -f "$f" ]] && FILES+=("$f")
done

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "No source files found to package." >&2
  exit 1
fi

# Create zip from stdin file list
printf "%s\n" "${FILES[@]}" | zip -q -@ "$OUTPUT_FILE"

mv -f "$OUTPUT_FILE" "$OUTPUT_PATH"

# Update symlink to point to the latest archive (relative link)
ln -sfn "$OUTPUT_FILE" "$LATEST_LINK"

echo "✅ Done!"
ls -lh "$OUTPUT_PATH" "$LATEST_LINK"