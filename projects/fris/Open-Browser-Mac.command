#!/bin/bash
# Double-click to preview the FRIS browser build on macOS.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "No Node.js found — opening the no-install single file instead."
  open "FRIS-Standalone.html"
  exit 0
fi
echo "Starting a local preview server... your browser will open automatically."
node serve.mjs
