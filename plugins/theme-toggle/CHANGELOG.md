# Changelog

All notable changes to the **Theme Toggle** plugin are documented here.
This project uses semantic versioning; release tags are `theme-toggle-v<version>`.

## [1.1.1] — 2026-11-19

### Changed
- **Logo redrawn** — `chrome/content/icons/logo.svg` is now a rounded square with a
  diagonal `/` slash, the sun in the upper-left area and the crescent moon in the
  lower-right area. Sun and moon are the same size and use the same glyph shapes as
  the toolbar icons; the moon keeps its stock orientation (not mirrored, not rotated).

## [1.1.0] — 2026-11-19

### Changed
- **New plugin logo** — `chrome/content/icons/logo.svg`: a capsule (toggle) outline
  containing a sun on the left, a slash in the middle and a crescent moon on the
  right. The sun and moon are the same size and use the same glyphs as the toolbar
  icons; the moon keeps its stock orientation (not mirrored, not rotated). Used as
  the add-on icon in the Plugins Manager and at the top of the plugin README.

## [1.0.2] — 2026-11-19

First public release.

### Added
- Toolbar button (sun/moon icon, placed left of the sync button) to toggle the
  light/dark color scheme.
- Keyboard shortcut `Ctrl+Shift+D` (macOS: `Cmd+Shift+D`).
- Tools menu item: **Toggle Light/Dark Mode** (localized as 切换深色/浅色模式).
- `en-US` and `zh-CN` localization files.
- Update manifest (`update.json`) and `update_url`, so Zotero's update check can
  pick up future releases from this repository.

### Changed
- Manifest now declares `author: murphy`, `homepage_url`, and a real `update_url`
  (previous internal builds used a placeholder).
- Author metadata and repository published under `murphyhoucn/zotero-plugin`.

### Fixed
- Installation failed on Zotero 8/10 because `applications.zotero.update_url` was
  missing from the manifest. Zotero requires this field; it is now present.

### Verified
- Installed and activated on Zotero 10.0.8 (Windows) without restart.
- Toolbar button injection, keyboard shortcut handling, Tools menu entry, and live
  light/dark switching (preference `browser.theme.toolbar-theme` 0 ↔ 1).
