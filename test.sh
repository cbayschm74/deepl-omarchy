#!/bin/bash

set -euo pipefail

project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
fixture=$(mktemp -d /tmp/deepl-omarchy-test.XXXXXX)
trap 'rm -rf -- "$fixture"' EXIT

bash -n "$project_root/launch.sh"
node --check "$project_root/electron-app/main.js"
jq -e '.version == "1.0.1"' "$project_root/manifest.json" >/dev/null
jq -e '.version == "1.0.1"' "$project_root/electron-app/package.json" >/dev/null

grep -F 'O_NOFOLLOW' "$project_root/electron-app/main.js" >/dev/null
grep -F 'O_NONBLOCK' "$project_root/electron-app/main.js" >/dev/null
grep -F 'fstatSync' "$project_root/electron-app/main.js" >/dev/null
grep -F 'timeout --kill-after=1s' "$project_root/launch.sh" >/dev/null

runtime_dir="$fixture/runtime"
mkdir -m 700 -- "$runtime_dir"
DEEPL_SKIP_CLIPBOARD=1 \
DEEPL_RUNTIME_DIR="$runtime_dir" \
DEEPL_ELECTRON=/bin/true \
  "$project_root/launch.sh"

[[ -f $runtime_dir/request && ! -L $runtime_dir/request ]]
[[ $(stat -c %a -- "$runtime_dir/request") == 600 ]]
[[ $(stat -c %u -- "$runtime_dir/request") == $(id -u) ]]

ln -s -- "$runtime_dir" "$fixture/runtime-link"
if DEEPL_SKIP_CLIPBOARD=1 \
  DEEPL_RUNTIME_DIR="$fixture/runtime-link" \
  DEEPL_ELECTRON=/bin/true \
  "$project_root/launch.sh" >/dev/null 2>&1; then
  echo "Launcher accepted a symbolic-link runtime directory" >&2
  exit 1
fi

echo "All checks passed"
