#!/usr/bin/env bash
# Mirrors: https://mirror.example.com/debian
set -euo pipefail

BASE="https://api.example.com/v1"
curl -fsSL "https://releases.example.com/latest.tar.gz" -o dist.tar.gz
wget 'http://old.example.com/legacy.zip'

echo "report to mailto:sre@example.com" >&2
echo "$BASE"
