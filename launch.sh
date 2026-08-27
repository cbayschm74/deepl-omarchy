#!/bin/bash

set -euo pipefail
umask 077

SCRIPT_PATH=${BASH_SOURCE[0]}
if [ -L "${SCRIPT_PATH}" ]; then
    SCRIPT_PATH=$(readlink -f "${SCRIPT_PATH}")
fi
SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
APP_DIR="$SCRIPT_DIR/electron-app"
RUNTIME_DIR="${DEEPL_RUNTIME_DIR:-${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/deepl-omarchy}"
REQUEST_FILE="$RUNTIME_DIR/request"
TEMP_FILE="$RUNTIME_DIR/request.new.$$"
MAXIMUM_CLIPBOARD_BYTES=$((1024 * 1024))

install -d -m 700 "$RUNTIME_DIR"
trap 'rm -f -- "$TEMP_FILE"' EXIT

printf '%s-%s\n' "$(date +%s%N)" "$$" > "$TEMP_FILE"
HEADER_BYTES=$(wc -c < "$TEMP_FILE")

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

    if [ -n "$TEXT_TYPE" ]; then
        set +e
        set +o pipefail
        wl-paste --type "$TEXT_TYPE" --no-newline 2>/dev/null \
            | head -c "$((MAXIMUM_CLIPBOARD_BYTES + 1))" >> "$TEMP_FILE"
        PASTE_STATUS=${PIPESTATUS[0]}
        set -o pipefail
        set -e

        PAYLOAD_BYTES=$(($(wc -c < "$TEMP_FILE") - HEADER_BYTES))
        if [ "$PAYLOAD_BYTES" -gt "$MAXIMUM_CLIPBOARD_BYTES" ]; then
            truncate -s "$HEADER_BYTES" "$TEMP_FILE"
            notify-send \
                --app-name="DeepL Clipboard" \
                --icon=dialog-warning \
                "DeepL Clipboard" \
                "Clipboard text is larger than 1 MiB, so the translator was opened empty." \
                || true
        elif [ "$PASTE_STATUS" -ne 0 ] && [ "$PASTE_STATUS" -ne 141 ]; then
            truncate -s "$HEADER_BYTES" "$TEMP_FILE"
            notify-send \
                --app-name="DeepL Clipboard" \
                --icon=dialog-warning \
                "DeepL Clipboard" \
                "The clipboard text could not be read. The translator was opened empty." \
                || true
        fi
    fi
fi

chmod 600 "$TEMP_FILE"
mv -f "$TEMP_FILE" "$REQUEST_FILE"
trap - EXIT

if [ -n "${DEEPL_ELECTRON:-}" ]; then
    ELECTRON_BIN=$DEEPL_ELECTRON
elif command -v electron43 >/dev/null 2>&1; then
    ELECTRON_BIN=electron43
elif command -v electron >/dev/null 2>&1; then
    ELECTRON_BIN=electron
else
    notify-send \
        --app-name="DeepL Clipboard" \
        --icon=dialog-error \
        "DeepL Clipboard" \
        "Electron is not installed. Install electron43 or set DEEPL_ELECTRON." \
        || true
    exit 127
fi

exec "$ELECTRON_BIN" --ozone-platform-hint=auto "$APP_DIR"
