# Theme Toggle v1.1.1 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.1.1` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.1/theme-toggle.xpi) |
| SHA-256 | `adc83b229f1ad0d2dce68063fa139598b18f866a1e542d5fa5e6fc13535e4c7c` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

Version 1.1.1 redraws the plugin logo. It is now a **rounded square with a diagonal
`/` slash**, the **sun in the upper-left** area and the **crescent moon in the
lower-right** area — the structure requested for the mark. Plugin behaviour is
unchanged from 1.1.0.

## Changing in this release

- **New logo** — `chrome/content/icons/logo.svg`:
  rounded square badge, diagonal slash, sun upper-left, moon lower-right.
- **Manifest icons** still point to `logo.svg` (48 px / 96 px entries), so the mark
  is what Zotero shows next to “Theme Toggle” in the Plugins Manager.
- **README** shows the logo at the top; the size preview lives at
  `docs/images/theme-toggle-logo-preview.png`.
- Toolbar icons are unchanged: `sun.svg` / `moon.svg` stay monochrome (theme-tinted
  via `context-fill`) because they indicate the *action* a click performs.

## Logo design notes

- Container: rounded square (20.8 units across with an 5.6 corner radius, filled
  `#2E3A59`) on a 24 × 24 grid.
- Diagonal: `/` from the lower-left to the upper-right corner area, stroke `#E8ECF5`.
- Sun: **upper-left**, glyph identical in shape to the toolbar sun icon, `#F6A623`.
- Moon: **lower-right**, the stock crescent glyph (upright, not mirrored, not
  rotated), `#8FB6FF`.
- Sun and moon occupy identical 5.6 × 5.6 boxes, so neither dominates.
- The filled badge keeps the mark readable on both light and dark UI backgrounds
  (Zotero's Plugins Manager uses a dark card in dark mode).
- Verified by rendering the SVG at 16 / 24 / 32 / 48 / 64 / 96 / 128 px on light and
  dark backgrounds before release.

## Verification performed

1. **Build** — `./scripts/build.sh` produces `dist/theme-toggle-1.1.1.xpi` with
   `manifest.json` at the archive root; `logo.svg` is included.
2. **Install** — installed in a live Zotero 10.0.8 through the Plugins Manager
   (gear → Install Plugin From File…); the add-on reports version `1.1.1`, state
   *active*, no restart required.
3. **Icon** — the new rounded-square logo is rendered by Zotero next to
   “Theme Toggle” in the Plugins Manager.
4. **Regression** — toolbar button, `Ctrl/Cmd+Shift+D` shortcut and the Tools menu
   entry still work; toggling still switches `browser.theme.toolbar-theme` `0 ↔ 1`
   and the UI repaints immediately.
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
[`theme-toggle-v1.1.1`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.1.1).
