const { app, BrowserWindow, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const TRANSLATOR_URL = "https://www.deepl.com/translator";
const MAXIMUM_CLIPBOARD_LENGTH = 1024 * 1024;
const WAYLAND_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR
  || path.join("/run", "user", String(process.getuid()));
const APP_RUNTIME_DIR = process.env.DEEPL_RUNTIME_DIR
  || path.join(WAYLAND_RUNTIME_DIR, "deepl-omarchy");
const REQUEST_FILE = path.join(APP_RUNTIME_DIR, "request");
const THEME_COLORS_FILE = path.join(
  os.homedir(), ".local", "state", "omarchy", "current", "theme", "colors.toml"
);

const USER_DATA_DIR = process.env.DEEPL_USER_DATA_DIR || path.join(
    process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
    "deepl-omarchy"
  );
const IS_FIRST_RUN = !fs.existsSync(path.join(USER_DATA_DIR, "Local State"));

app.setName("DeepL Clipboard");
app.setPath("userData", USER_DATA_DIR);

let mainWindow = null;
let pendingText = "";
let lastRequestId = "";
let injectionTimer = null;
let injectionAttempts = 0;
let styleTimer = null;
let styleAttempts = 0;
let insertedCssKey = null;
let minimalMode = process.env.DEEPL_START_FULL_PAGE !== "1" && !IS_FIRST_RUN;
let pageStyled = false;
let revealTimer = null;

function readThemePalette() {
  const darkFallback = nativeTheme.shouldUseDarkColors;
  const fallback = darkFallback
    ? {
        dark: true,
        background: "#1e1e1e",
        surface: "#282828",
        elevated: "#3c3836",
        foreground: "#d4be98",
        muted: "#665c54",
        accent: "#7daea3",
      }
    : {
        dark: false,
        background: "#f5f5f5",
        surface: "#ffffff",
        elevated: "#eeeeee",
        foreground: "#242424",
        muted: "#d0d0d0",
        accent: "#006494",
      };

  try {
    const source = fs.readFileSync(THEME_COLORS_FILE, "utf8");
    const value = (name) => source.match(
      new RegExp(`^\\s*${name}\\s*=\\s*["']([^"']+)["']`, "m")
    )?.[1];
    const dark = (value("mode") || (darkFallback ? "dark" : "light")) !== "light";
    return {
      dark,
      background: value("dark_background") || value("background") || fallback.background,
      surface: value("background") || fallback.surface,
      elevated: value("lighter_background") || fallback.elevated,
      foreground: value("foreground") || fallback.foreground,
      muted: value("muted") || fallback.muted,
      accent: value("accent") || value("blue") || fallback.accent,
    };
  } catch (_) {
    return fallback;
  }
}

function pageStyleCss(palette) {
  return `
    :root {
      color-scheme: ${palette.dark ? "dark" : "light"} !important;
      --deepl-omarchy-background: ${palette.background};
      --deepl-omarchy-surface: ${palette.surface};
      --deepl-omarchy-elevated: ${palette.elevated};
      --deepl-omarchy-foreground: ${palette.foreground};
      --deepl-omarchy-muted: ${palette.muted};
      --deepl-omarchy-accent: ${palette.accent};
    }

    html, body {
      background-color: var(--deepl-omarchy-background) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    /* The complete page is used for login and account management. DeepL gives
       its header, navigation drawers, dropdowns, and dialogs independent light
       surfaces, so theme those explicitly when compact mode is disabled. */
    html:not([data-deepl-omarchy-minimal]) :is(
      header,
      nav,
      aside,
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [aria-modal="true"],
      [class*="bg-white"],
      [class*="bg-surface"]
    ) {
      background-color: var(--deepl-omarchy-surface) !important;
      border-color: var(--deepl-omarchy-muted) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(
      header,
      nav,
      aside,
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [aria-modal="true"]
    ) :is(a, button, label, p, span, div, h1, h2, h3, li) {
      border-color: var(--deepl-omarchy-muted) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(
      [role="dialog"],
      [role="menu"],
      [role="listbox"],
      [aria-modal="true"]
    ) :is(input, textarea, select) {
      background-color: var(--deepl-omarchy-elevated) !important;
      border-color: var(--deepl-omarchy-muted) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(
      header,
      nav,
      aside,
      [role="dialog"],
      [role="menu"],
      [role="listbox"]
    ) button:hover {
      background-color: var(--deepl-omarchy-elevated) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(
      button,
      a[role="button"],
      [role="button"]
    ) {
      background-color: transparent !important;
      border-color: var(--deepl-omarchy-muted) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(
      button,
      a[role="button"],
      [role="button"]
    ):is(
      [aria-current="true"],
      [aria-selected="true"],
      [aria-pressed="true"],
      [data-state="active"],
      :hover
    ) {
      background-color: var(--deepl-omarchy-elevated) !important;
    }

    html:not([data-deepl-omarchy-minimal]) :is(header, nav, aside) svg,
    html:not([data-deepl-omarchy-minimal]) :is(header, nav, aside) svg * {
      color: var(--deepl-omarchy-foreground) !important;
      fill: currentColor !important;
      stroke: currentColor !important;
    }

    /* Keep DeepL's menus and marketing layout out of sight until the exact
       translator ancestry has been identified. The window can still appear
       immediately with useful visual feedback instead of looking unresponsive. */
    html:not([data-deepl-omarchy-ready]) body {
      visibility: hidden !important;
    }

    html:not([data-deepl-omarchy-ready])::after {
      align-items: center;
      background: var(--deepl-omarchy-background);
      color: var(--deepl-omarchy-foreground);
      content: "Loading translator…";
      display: flex;
      font: 500 15px/1.4 ui-sans-serif, system-ui, sans-serif;
      inset: 0;
      justify-content: center;
      position: fixed;
      visibility: visible !important;
      z-index: 2147483647;
    }

    * {
      scrollbar-color: var(--deepl-omarchy-muted) var(--deepl-omarchy-background) !important;
      scrollbar-width: thin !important;
    }

    *::-webkit-scrollbar {
      background: var(--deepl-omarchy-background) !important;
      height: 10px !important;
      width: 10px !important;
    }

    *::-webkit-scrollbar-track,
    *::-webkit-scrollbar-corner {
      background: var(--deepl-omarchy-background) !important;
    }

    *::-webkit-scrollbar-thumb {
      background: var(--deepl-omarchy-muted) !important;
      border: 2px solid var(--deepl-omarchy-background) !important;
      border-radius: 999px !important;
    }

    *::-webkit-scrollbar-thumb:hover {
      background: var(--deepl-omarchy-accent) !important;
    }

    html[data-deepl-omarchy-minimal] body {
      margin: 0 !important;
      min-height: 100vh !important;
      overflow-x: hidden !important;
    }

    html[data-deepl-omarchy-minimal]
      [data-deepl-omarchy-path]:not(body):not([data-testid="translator"])
      > :not([data-deepl-omarchy-path]) {
      display: none !important;
    }

    html[data-deepl-omarchy-minimal]
      body[data-deepl-omarchy-path]
      > :not([data-deepl-omarchy-path]):not([role="dialog"]):not([role="listbox"]):not([role="menu"]):not(:has([role="dialog"])):not(:has([role="listbox"])):not(:has([role="menu"])) {
      display: none !important;
    }

    html[data-deepl-omarchy-minimal] [data-deepl-omarchy-path] {
      box-sizing: border-box !important;
      max-width: none !important;
      width: 100% !important;
    }

    /* DeepL keeps spacing for its full-site header on some translated states.
       These elements are only the ancestry wrappers around the translator. */
    html[data-deepl-omarchy-minimal]
      [data-deepl-omarchy-path]:not(body):not([data-testid="translator"]) {
      margin-block-start: 0 !important;
      padding-block-start: 0 !important;
    }

    html[data-deepl-omarchy-minimal] [data-testid="translator"] {
      margin: 0 !important;
      max-width: none !important;
      min-height: 100vh !important;
      padding: 18px !important;
      width: 100% !important;
    }

    html[data-deepl-omarchy-minimal]
      [data-testid="dl-header"][data-deepl-omarchy-path] {
      display: contents !important;
    }

    html[data-deepl-omarchy-minimal]
      [data-testid="translator"] section[class*="homeExperience"],
    html[data-deepl-omarchy-minimal]
      [data-testid="translator"] [class*="animatedLogoCloud"] {
      display: none !important;
    }

    [data-testid="translator"],
    [data-testid="translator"] [class*="bg-surface"],
    [data-testid="translator"] [class*="bg-action-basic"],
    [data-testid="translator"] [class*="bg-white"],
    [data-testid="translator"] d-textarea,
    [data-testid="translator"] [role="textbox"],
    [data-testid="translator"] [contenteditable="true"] {
      background-color: var(--deepl-omarchy-surface) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    [data-testid="translator"] button {
      color: var(--deepl-omarchy-foreground) !important;
    }

    [data-testid="translator"] a.Button.as-basic,
    [data-testid="translator"] [role="tab"] {
      background-color: var(--deepl-omarchy-surface) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    [data-testid="translator"] [data-testid="side-panel-expand-button"] {
      background-color: var(--deepl-omarchy-elevated) !important;
      border: 1px solid var(--deepl-omarchy-muted) !important;
      color: var(--deepl-omarchy-foreground) !important;
    }

    [data-testid="translator"] [data-testid="side-panel-expand-button"] svg,
    [data-testid="translator"] [data-testid="side-panel-expand-button"] svg * {
      color: var(--deepl-omarchy-foreground) !important;
      stroke: currentColor !important;
    }

    [data-testid="translator"] button:hover {
      background-color: var(--deepl-omarchy-elevated) !important;
    }

    [data-testid="translator"] [role="textbox"],
    [data-testid="translator"] [contenteditable="true"] {
      caret-color: var(--deepl-omarchy-accent) !important;
    }

    /* Clipboard injection can make DeepL rebuild the two editor panels under
       its sticky language bar. Move the complete panels—including borders,
       clear button, content, and footer controls—into normal flow below it. */
    html[data-deepl-omarchy-minimal]
      [data-deepl-omarchy-editor-panel] {
      margin-block-start: 52px !important;
    }

    [data-testid="translator"] [class*="border-"] {
      border-color: var(--deepl-omarchy-muted) !important;
    }
  `;
}

async function applyPageStyle(refreshCss = false) {
  if (!mainWindow || mainWindow.isDestroyed() || !isTranslatorPage(mainWindow.webContents.getURL()))
    return;

  try {
    // Paint the base Omarchy palette before waiting for DeepL's translator
    // component. Insert the replacement first so an update never exposes the
    // site's white stylesheet between remove/insert operations.
    if (!insertedCssKey || !pageStyled || refreshCss) {
      const previousCssKey = insertedCssKey;
      insertedCssKey = await mainWindow.webContents.insertCSS(
        pageStyleCss(readThemePalette())
      );
      if (previousCssKey) {
        try { await mainWindow.webContents.removeInsertedCSS(previousCssKey); } catch (_) {}
      }

      if (!pageStyled) {
        pageStyled = true;
        clearTimeout(revealTimer);
        // Let Chromium paint the dark base layer before revealing the window.
        revealTimer = setTimeout(focusMainWindow, 50);
      }
    }

    const translatorReady = await mainWindow.webContents.executeJavaScript(`
      (() => {
        if (window.__deeplOmarchyObserver) {
          window.__deeplOmarchyObserver.disconnect();
          window.__deeplOmarchyObserver = null;
        }

        const clearMinimalMarkers = () => {
          document.documentElement.removeAttribute("data-deepl-omarchy-ready");
          document.documentElement.removeAttribute("data-deepl-omarchy-minimal");
          document.querySelectorAll(
            "[data-deepl-omarchy-path], [data-deepl-omarchy-editor-panel]"
          ).forEach((element) => {
            element.removeAttribute("data-deepl-omarchy-path");
            element.removeAttribute("data-deepl-omarchy-editor-panel");
          });
        };

        const markTranslatorPath = () => {
          clearMinimalMarkers();
          const translator = document.querySelector('[data-testid="translator"]');
          if (!translator) return false;

          const sourceEditor = translator.querySelector(
            '[data-testid="translator-source-input"]'
          );
          const targetEditor = translator.querySelector([
            '[data-testid="translator-target-output"]',
            '[data-testid="translator-target-input"]',
          ].join(','));
          const translatorRect = translator.getBoundingClientRect();
          const findEditorPanel = (editor) => {
            if (!editor) return null;
            let candidate = editor;
            let element = editor;
            while (element && element !== translator) {
              const rect = element.getBoundingClientRect();
              const isHalfWidthPanel = rect.width >= translatorRect.width * 0.30
                && rect.width <= translatorRect.width * 0.62
                && rect.height >= 160;
              if (isHalfWidthPanel) candidate = element;
              element = element.parentElement;
            }
            return candidate;
          };
          const sourcePanel = findEditorPanel(sourceEditor);
          const targetPanel = findEditorPanel(targetEditor);
          sourcePanel?.setAttribute("data-deepl-omarchy-editor-panel", "");
          targetPanel?.setAttribute("data-deepl-omarchy-editor-panel", "");

          const translatorChanged = window.__deeplOmarchyTranslator !== translator;
          const editorChanged = (Boolean(sourceEditor)
            && window.__deeplOmarchySourceEditor !== sourceEditor)
            || (Boolean(targetEditor)
              && window.__deeplOmarchyTargetEditor !== targetEditor);
          const shouldReposition = !window.__deeplOmarchyMinimalActive
            || translatorChanged
            || editorChanged;

          window.__deeplOmarchyMinimalActive = true;
          window.__deeplOmarchyTranslator = translator;
          window.__deeplOmarchySourceEditor = sourceEditor;
          window.__deeplOmarchyTargetEditor = targetEditor;
          document.documentElement.setAttribute("data-deepl-omarchy-minimal", "");
          let element = translator;
          while (element) {
            element.setAttribute("data-deepl-omarchy-path", "");
            if (element === document.body) break;
            element = element.parentElement;
          }
          document.documentElement.setAttribute("data-deepl-omarchy-ready", "");
          if (shouldReposition) {
            [0, 80, 200, 400, 700].forEach((delay) => {
              setTimeout(() => window.scrollTo({ top: 0, left: 0 }), delay);
            });
          }
          return true;
        };

        clearMinimalMarkers();
        const translator = document.querySelector('[data-testid="translator"]');
        if (!translator) return false;
        if (!${minimalMode}) {
          window.__deeplOmarchyMinimalActive = false;
          window.__deeplOmarchyTranslator = null;
          window.__deeplOmarchySourceEditor = null;
          window.__deeplOmarchyTargetEditor = null;
          document.documentElement.setAttribute("data-deepl-omarchy-ready", "");
          return true;
        }

        let scheduled = false;
        const observer = new MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          requestAnimationFrame(() => {
            scheduled = false;
            markTranslatorPath();
          });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__deeplOmarchyObserver = observer;
        return markTranslatorPath();
      })()
    `, true);

    if (!translatorReady) {
      if (++styleAttempts < 30) {
        clearTimeout(styleTimer);
        styleTimer = setTimeout(applyPageStyle, 400);
      }
      return;
    }

    styleAttempts = 0;
  } catch (_) {}
}

function isTranslatorPage(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && (parsed.hostname === "deepl.com" || parsed.hostname.endsWith(".deepl.com"))
      && /\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?translator(?:\/|$)/.test(parsed.pathname);
  } catch (_) {
    return false;
  }
}

function focusMainWindow() {
  if (!mainWindow) return;
  if (!pageStyled) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function injectionScript(text) {
  return `(${function insertSourceText(value) {
    const selectors = [
      "textarea[data-testid='translator-source-input']",
      "[data-testid='translator-source-input'] textarea",
      "[data-testid='translator-source-input'][contenteditable='true']",
      "[data-testid='translator-source-input'] [contenteditable='true']",
      ".lmt__source_textarea",
      "main textarea",
      "main [contenteditable='true'][role='textbox']",
      "main [contenteditable='true']",
    ];

    let input = null;
    for (const selector of selectors) {
      input = Array.from(document.querySelectorAll(selector)).find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (input) break;
    }
    if (!input) return false;

    input.focus({ preventScroll: true });
    if ("value" in input) {
      const prototype = input.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      if (descriptor?.set) descriptor.set.call(input, value);
      else input.value = value;
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand("insertText", false, value)) input.textContent = value;
    }

    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      inputType: "insertText",
      data: value,
    }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // DeepL focuses the source editor after programmatic input and may scroll
    // it underneath the sticky language selector. Keep the compact view at
    // its intended top position; normal user scrolling still works afterward.
    [0, 100, 250, 500, 900].forEach((delay) => {
      setTimeout(() => window.scrollTo({ top: 0, left: 0 }), delay);
    });
    return true;
  }.toString()})(${JSON.stringify(text)})`;
}

async function tryInjectClipboard() {
  if (!mainWindow || mainWindow.isDestroyed() || !pendingText) return;
  if (!isTranslatorPage(mainWindow.webContents.getURL())) return;

  try {
    const applied = await mainWindow.webContents.executeJavaScript(
      injectionScript(pendingText),
      true
    );
    if (applied) {
      pendingText = "";
      injectionAttempts = 0;
      return;
    }
  } catch (_) {
    // DeepL may replace the editor while its application is still loading.
  }

  if (++injectionAttempts < 30) {
    clearTimeout(injectionTimer);
    injectionTimer = setTimeout(tryInjectClipboard, 400);
  }
}

function translateClipboardRequest() {
  focusMainWindow();

  let request;
  try {
    request = fs.readFileSync(REQUEST_FILE, "utf8");
  } catch (_) {
    return;
  }

  const separator = request.indexOf("\n");
  if (separator < 0) return;

  const requestId = request.slice(0, separator);
  if (!requestId || requestId === lastRequestId) return;
  lastRequestId = requestId;

  const text = request.slice(separator + 1);
  try {
    // Keep the request marker but remove clipboard contents from disk as soon
    // as this process has copied them into memory.
    fs.writeFileSync(REQUEST_FILE, `${requestId}\n`, { mode: 0o600 });
  } catch (_) {}

  if (!text || text.length > MAXIMUM_CLIPBOARD_LENGTH) return;

  pendingText = text;
  injectionAttempts = 0;
  clearTimeout(injectionTimer);
  injectionTimer = setTimeout(tryInjectClipboard, 100);
}

function configureWebContents(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      if (new URL(url).protocol === "https:") {
        return {
          action: "allow",
          overrideBrowserWindowOptions: {
            width: 560,
            height: 720,
            autoHideMenuBar: true,
            backgroundColor: "#111318",
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
            },
          },
        };
      }
    } catch (_) {}
    return { action: "deny" };
  });

  // Authentication providers may use HTTPS redirects or sandboxed popup
  // windows. Keep those working for paid DeepL accounts, but never allow a
  // remote page to navigate this application to a local or executable scheme.
  contents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).protocol === "https:") return;
    } catch (_) {}
    event.preventDefault();
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}

function createMainWindow() {
  pageStyled = false;
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    title: "DeepL Clipboard",
    autoHideMenuBar: true,
    backgroundColor: "#111318",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  // If DeepL changes its markup and the translator can no longer be detected,
  // prefer a usable full page after a grace period over an invisible window.
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => {
    pageStyled = true;
    focusMainWindow();
  }, 15000);

  configureWebContents(mainWindow.webContents);
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.control && input.shift && input.key.toLowerCase() === "m") {
      minimalMode = !minimalMode;
      styleAttempts = 0;
      applyPageStyle();
      event.preventDefault();
    }
  });
  mainWindow.webContents.on("did-create-window", (window) => {
    configureWebContents(window.webContents);
  });
  mainWindow.webContents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
    if (!isMainFrame) return;
    pageStyled = false;
    insertedCssKey = null;
  });
  mainWindow.webContents.on("dom-ready", () => {
    styleAttempts = 0;
    clearTimeout(styleTimer);
    applyPageStyle();
    if (pendingText) {
      injectionAttempts = 0;
      clearTimeout(injectionTimer);
      injectionTimer = setTimeout(tryInjectClipboard, 100);
    }
  });
  mainWindow.webContents.on("did-finish-load", () => {
    styleAttempts = 0;
    clearTimeout(styleTimer);
    applyPageStyle();
    if (pendingText) {
      injectionAttempts = 0;
      clearTimeout(injectionTimer);
      injectionTimer = setTimeout(tryInjectClipboard, 300);
    }
  });
  mainWindow.webContents.on("did-navigate-in-page", () => {
    styleAttempts = 0;
    clearTimeout(styleTimer);
    styleTimer = setTimeout(applyPageStyle, 100);
  });
  mainWindow.once("ready-to-show", () => {
    translateClipboardRequest();
  });
  mainWindow.on("closed", () => {
    clearTimeout(revealTimer);
    mainWindow = null;
  });
  mainWindow.loadURL(TRANSLATOR_URL);
}

nativeTheme.on("updated", () => applyPageStyle(true));
fs.watchFile(THEME_COLORS_FILE, { interval: 1000 }, () => applyPageStyle(true));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    translateClipboardRequest();
  });

  app.whenReady().then(createMainWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else focusMainWindow();
  });
  app.on("window-all-closed", () => app.quit());
}
