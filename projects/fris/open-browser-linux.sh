#!/bin/bash
# Preview the FRIS browser build on Linux:  chmod +x open-browser-linux.sh  then  ./open-browser-linux.sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "No Node.js found. Open FRIS-Standalone.html in your browser instead (no install needed)."
  exit 0
fi
echo "Starting a local preview server... your browser will open automatically."
node serve.mjs
