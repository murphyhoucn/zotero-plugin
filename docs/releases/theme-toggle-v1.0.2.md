# Theme Toggle v1.0.2 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.0.2` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.0.2/theme-toggle.xpi) |
| SHA-256 | `4288628b9f22f48acd0b94670ad607ba8589ff5b60a4aaa73778ebde0b1831c7` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

**Theme Toggle** is a tiny Zotero plugin that exposes Zotero's own light/dark color
scheme switch outside the Settings window. It does not ship a theme: it only writes
Zotero's native preference `browser.theme.toolbar-theme` (`0` = Dark, `1` = Light,
`2` = Follow system), so the resulting look is identical to picking Light/Dark under
**Settings → General → Color Scheme** — but reachable in one click or one keystroke,
and applied instantly without restarting Zotero.

This is the first public release and the first artifact published from the
`zotero-plugin` repository.

## What's included in 1.0.2

- **Toolbar button** — a sun/moon icon in the top toolbar, immediately left of the
  sync button; the icon reflects the action it will perform (sun = switch to light).
- **Keyboard shortcut** — `Ctrl+Shift+D` on Windows/Linux, `Cmd+Shift+D` on macOS.
- **Tools menu entry** — *Toggle Light/Dark Mode* (localized: 切换深色/浅色模式).
- **Localization** — `en-US` and `zh-CN` FTL strings; Zotero's own locale fallback
  applies to other languages.
- **Automatic update support** — the manifest declares
  `applications.zotero.update_url`, and the repository publishes `update.json`, so
  Zotero's update check can offer future releases.
- Instant live switching, multiple main windows supported, clean enable/disable
  (no leftover UI, no leftover preference observers).

## Verification performed

All checks were run against a live Zotero 10.0.8 installation:

1. **Install** — installed from file through the Plugins Manager; Zotero reports the
   add-on as active immediately (no restart). Installed version in the profile:
   `1.0.1 → 1.0.2`.
2. **Toolbar button** — element `#zotero-tb-theme-toggle` is injected into
   `#zotero-tabs-toolbar` and resolves its icon from
   `chrome://theme-toggle/content/icons/sun.svg` while dark mode is active.
3. **Toggle logic** — triggering the button/command toggles the preference
   `browser.theme.toolbar-theme` `0 → 1 → 0` as expected.
4. **Live apply** — after switching the preference, the main window repaints into
   the opposite scheme immediately (no restart, no window reload).
5. **Keyboard shortcut** — a capture-phase `keydown` listener handles
   `Ctrl+Shift+D`; verified by dispatching the chord and observing the preference
   change.
6. **Context menu** — the Tools menu renders the custom item
   (`theme-toggle-menu-label`) through `Zotero.MenuManager`.
7. **Regression fixed before release** — a manifest without
   `applications.zotero.update_url` is rejected by Zotero 8/10 during installation
   (“could not be installed / may be incompatible”); the field is now present and
   installation succeeds.

## Installation

1. Download `theme-toggle.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file. The toolbar button appears immediately.

To uninstall: **Tools → Plugins → Theme Toggle → Remove**.

## Known limitations

- The toggle always switches between the two explicit modes; to go back to
  “follow system”, choose **Automatic** in Settings → General → Color Scheme.
- Only Zotero 8+ is supported (the plugin uses the Zotero 8 plugin APIs such as
  `Zotero.MenuManager`). `strict_max_version` is `10.*` and will be bumped when
  needed.
- Automatic updates require the update manifest to stay in sync with the latest
  release; it is published at
  `plugins/theme-toggle/update.json` on the `main` branch.

## Files in this release

| File | Description |
|---|---|
| `theme-toggle.xpi` | Installable plugin package (signed-nothing, install via Plugins Manager) |

Source code for this release is available in the repository at tag
[`theme-toggle-v1.0.2`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.0.2).
