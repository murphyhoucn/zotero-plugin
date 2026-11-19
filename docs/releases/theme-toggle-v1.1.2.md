# Theme Toggle v1.1.2 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.1.2` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.2/theme-toggle.xpi) |
| SHA-256 | `a37ef4f861cf51730f4e2caaa1607c543614a165030747dcebac1575aca16c9c` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

Version 1.1.2 puts the plugin **logo in front of the Tools menu label**, the same way
other Zotero plugins present their menu entries. Plugin behaviour is unchanged from
1.1.1.

## Changing in this release

- The `Zotero.MenuManager` registration for **Tools → Toggle Light/Dark Mode** now
  passes `icon` and `darkIcon` pointing at
  `chrome://theme-toggle/content/icons/logo.svg`, so the menu item is rendered as an
  “iconic” item with the plugin logo before the label (in both light and dark UI).
- Toolbar button and keyboard shortcut are unchanged (they were already correct).

## Verification performed

1. **Build** — `./scripts/build.sh` produces `dist/theme-toggle-1.1.2.xpi` with
   `manifest.json` at the archive root.
2. **Install** — installed over 1.1.1 in a live Zotero 10.0.8; the add-on reports
   version `1.1.2`, state *active*, no restart required.
3. **Menu item** — after the plugin starts, the Tools popup contains a custom
   `menuitem` with the `menuitem-iconic` class and the icon CSS variables
   (`--custom-menu-icon-light` / `--custom-menu-icon-dark`) set to
   `chrome://theme-toggle/content/icons/logo.svg`.
4. **Regression** — toolbar button, `Ctrl/Cmd+Shift+D` shortcut and the menu command
   itself still toggle `browser.theme.toolbar-theme` `0 ↔ 1` with an immediate UI
   repaint.
5. **Checksum** — the published artifact's SHA-256 matches the locally built file.

## Installation

1. Download `theme-toggle.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file. Existing installations are upgraded in place; no restart.

## Files in this release

| File | Description |
|---|---|
| `theme-toggle.xpi` | Installable plugin package |

Source code for this release is available at tag
[`theme-toggle-v1.1.2`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.1.2).
