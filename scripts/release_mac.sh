#!/bin/bash
# scripts/release_mac.sh — Build macOS .dmg installer for PGRay locally
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."
cd "$ROOT"

echo "Step 1/2 — Building Python backend binary (pgray-backend)..."
python3 -m pip install -r backend/requirements.txt pyinstaller
mkdir -p frontend/resources
python3 -m PyInstaller --onefile --name pgray-backend --paths backend --distpath frontend/resources backend/run_local.py
chmod +x frontend/resources/pgray-backend
rm -rf frontend/resources/saved_queries
cp -R backend/saved_queries frontend/resources/saved_queries

echo "Step 2/2 — Building Vite + Electron macOS .dmg..."
cd frontend
npm install
export VITE_ELECTRON=true
export CSC_IDENTITY_AUTO_DISCOVERY=false
unset CSC_LINK
npx tsc
npx vite build
npx electron-builder --mac --arm64 --config.mac.identity=null

echo "Build complete! Output DMG in frontend/release/:"
ls -lh release/*.dmg
