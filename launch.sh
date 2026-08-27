#!/bin/bash

set -euo pipefail
umask 077

SCRIPT_PATH=${BASH_SOURCE[0]}
if [ -L "${SCRIPT_PATH}" ]; then
    SCRIPT_PATH=$(readlink -f "${SCRIPT_PATH}")
fi
SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
APP_DIR="$SCRIPT_DIR/electron-app"
RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/deepl-omarchy"
REQUEST_FILE="$RUNTIME_DIR/request"
TEMP_FILE="$RUNTIME_DIR/request.new.$$"

install -d -m 700 "$RUNTIME_DIR"
trap 'rm -f -- "$TEMP_FILE"' EXIT

printf '%s-%s\n' "$(date +%s%N)" "$$" > "$TEMP_FILE"

if [ "${DEEPL_SKIP_CLIPBOARD:-0}" != "1" ]; then
    TEXT_TYPE=""
    while IFS= read -r OFFERED_TYPE; do
        case "$OFFERED_TYPE" in
            text/plain | 'text/plain;charset=utf-8' | UTF8_STRING | STRING | TEXT)
                TEXT_TYPE="$OFFERED_TYPE"
                break
                ;;
        esac
    done < <(wl-paste --list-types 2>/dev/null || true)

    if [ -n "$TEXT_TYPE" ] && ! wl-paste --type "$TEXT_TYPE" --no-newline >> "$TEMP_FILE" 2>/dev/null; then
        notify-send \
            --app-name="DeepL Clipboard" \
            --icon=dialog-warning \
            "DeepL Clipboard" \
            "The clipboard text could not be read. Please copy it again."
    fi
fi

chmod 600 "$TEMP_FILE"
mv -f "$TEMP_FILE" "$REQUEST_FILE"
trap - EXIT

exec electron43 --ozone-platform-hint=auto "$APP_DIR"
