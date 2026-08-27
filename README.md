# DeepL Clipboard for Omarchy

An unofficial clipboard translator that integrates the DeepL web translator
with the Omarchy desktop. Copy text, press `Ctrl+Alt+C` or click the bar icon,
and the text is inserted into a compact, floating translator window.

The client follows the active Omarchy light or dark palette, preserves a
private DeepL login session, and uses the system Electron runtime. It is built
for Wayland and does not depend on Go, GTK WebKit, `xsel`, or `xdotool`.

## Features

- Reuses one centered, floating translator window.
- Reads the clipboard only when explicitly launched.
- Accepts only advertised plain-text clipboard formats; images and other
  binary formats open an empty translator instead of being submitted.
- Supports clipboard text from browsers and other Wayland applications.
- Preserves DeepL login cookies in a private application profile.
- Applies the current Omarchy color palette, including styled scrollbars.
- Hides the surrounding website for a compact translator-focused view.
- Provides an Omarchy bar widget and works with a Hyprland shortcut.
- Press `Ctrl+Shift+M` in the translator to toggle the full DeepL page.

## Requirements

- Omarchy with Hyprland and the Omarchy shell
- `electron43`
- `wl-clipboard`
- `libnotify` (used only when clipboard text cannot be read)

## Install

Clone the project at the default location expected by the included widget:

```bash
git clone <your-repository-url> "$HOME/deepl-omarchy"
chmod +x "$HOME/deepl-omarchy/launch.sh"
```

Install the user-owned bar plugin:

```bash
mkdir -p "$HOME/.config/omarchy/plugins/cbayschm.deepl"
cp "$HOME/deepl-omarchy/omarchy-plugin/BarWidget.qml" \
  "$HOME/deepl-omarchy/omarchy-plugin/manifest.json" \
  "$HOME/.config/omarchy/plugins/cbayschm.deepl/"
```

Add the plugin ID `cbayschm.deepl` to the desired section of
`~/.config/omarchy/shell.json`.

Add the keyboard shortcut to `~/.config/hypr/bindings.lua`:

```lua
o.bind(
  "CTRL + ALT + C",
  "Translate clipboard with DeepL",
  os.getenv("HOME") .. "/deepl-omarchy/launch.sh"
)
```

Add the floating window rule to `~/.config/hypr/hyprland.lua`:

```lua
o.window("^deepl-omarchy$", {
  float = true,
  center = true,
  size = { 1100, 760 },
})
```

Reload and validate Hyprland after editing its configuration:

```bash
hyprctl reload
hyprctl configerrors
```

## Privacy and security

Clipboard text is handed to Electron through a mode-`0600` request file under
the current user's Wayland runtime directory. Electron copies it into memory
and immediately clears the text from that file. Requests larger than 1 MiB
are rejected. Clipboard contents are not logged.

The persistent browser profile is stored outside the repository at
`~/.local/share/deepl-omarchy`. Never commit that directory. Text submitted
for translation is processed by DeepL under DeepL's own terms and privacy
policy.

## Acknowledgements

This project was inspired by Kumakichi's archived
[Deepl-linux](https://github.com/kumakichi/Deepl-linux) project and its
[MIT-licensed Electron successor](https://github.com/kumakichi/Deepl-linux-electron).
Thank you to Kumakichi for the original Linux clipboard-translation workflow.

No source code or assets from the archived Go repository are included in this
project.

## Disclaimer

This is an unofficial community project. It is not affiliated with, endorsed
by, or sponsored by DeepL SE. DeepL is a trademark of DeepL SE.

## License

MIT. See [LICENSE](LICENSE).
