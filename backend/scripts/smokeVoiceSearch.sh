#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <base_url> <jwt_token> <audio_file_path>"
  echo "Example: $0 http://127.0.0.1:5000 eyJhbGciOi... ./sample.m4a"
  exit 1
fi

BASE_URL="$1"
JWT_TOKEN="$2"
AUDIO_FILE="$3"

curl -sS -X POST "${BASE_URL%/}/api/mobile/search/voice" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -F "audio=@${AUDIO_FILE}" | jq .
