# Theme Toggle v1.1.4 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.1.4` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.4/theme-toggle.xpi) |
| SHA-256 | `20be7afab06768a5e6c6e8b09ad7ee48b009601d2a7a20b597f1926ea9059c5f` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

Version 1.1.4 **removes the Tools menu entry**. The plugin now has exactly two
triggers: the toolbar button left of the sync button, and `Ctrl/Cmd+Shift+D`.
Both switch Zotero's native light/dark color scheme instantly.

## Why the menu entry was removed

The menu item never got its icon to render reliably in Zotero 10's dark Tools
menu, despite being registered through `Zotero.MenuManager` with both `icon` and
`darkIcon`. The extra entry point was not needed anyway — the toolbar button and
the shortcut cover the workflow — so the menu integration was removed instead of
keeping a half-styled item.

## Changing in this release

- Removed `Zotero.MenuManager.registerMenu()` / `unregisterMenu()` and all
  menu-related code from `bootstrap.js`.
- Removed the menu-only FTL strings; only the two toolbar tooltips remain.
- Updated the manifest description, plugin README and root README to describe the
  two remaining triggers.
- Logo and toolbar icons unchanged from 1.1.3.

## Verification performed

1. **Build** — `./scripts/build.sh` produces `dist/theme-toggle-1.1.4.xpi`
   (5,194 bytes), with `manifest.json` at the archive root.
2. **Live upgrade** — installed over 1.1.3 through
   `AddonManager.getInstallForFile(...).install()` in a running Zotero 10.0.8.
   The add-on reports version `1.1.4`, state *active*, no restart required.
3. **Menu removal** — a runtime scan of `#menu_ToolsPopup` found **0** nodes whose
   id, `data-l10n-id` or class mentions `theme-toggle`.
4. **Remaining entries** — `#zotero-tb-theme-toggle` exists immediately before
   `#zotero-tb-sync`, `window.__themeToggleKeyHandler` is registered, and the
   plugin FTL file is loaded in the main window.
5. **Toggle logic** — unchanged from 1.1.3, where the button and shortcut were
   verified to flip `browser.theme.toolbar-theme` `0 ↔ 1` with an immediate
   repaint. 1.1.4 only deletes the menu path.
6. **Checksum** — the published artifact's SHA-256 matches the locally built file.

Runtime check result after the live upgrade:

```json
{"v":"1.1.4","a":true,"b":true,"k":true,"m":0,"f":1}
```

`v` version, `a` active, `b` toolbar button present, `k` key handler present,
`m` theme-toggle nodes in the Tools menu, `f` FTL links in the main window.

## Installation

1. Download `theme-toggle.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file. Existing installations are upgraded in place; no restart.

## Files in this release

| File | Description |
|---|---|
| `theme-toggle.xpi` | Installable plugin package |

Source code for this release is available at tag
[`theme-toggle-v1.1.4`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.1.4).