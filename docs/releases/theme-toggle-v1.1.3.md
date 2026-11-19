# Theme Toggle v1.1.3 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.1.3` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.3/theme-toggle.xpi) |
| SHA-256 | `a931e9e33f94cb8f4ba86df3a8e5e6edc9edfa812903ce7cc13ff500a6a52a96` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

Version 1.1.3 tunes the logo: the diagonal `/` is now **thinner and 50 % transparent**,
and the **sun and moon are slightly larger** while keeping comfortable spacing. Plugin
behaviour is unchanged from 1.1.2.

## Changing in this release

- Diagonal slash: stroke width `1.5 → 1.0`, `stroke-opacity: 0.5`, so it reads as a
  subtle separator instead of a strong element.
- Sun and moon glyph boxes: `5.6 → 6.4` (≈ +14 %), still equal size, still using the
  stock toolbar glyph shapes (moon upright and unmirrored).
- Everything else unchanged: rounded-square badge, palette, toolbar button,
  `Ctrl/Cmd+Shift+D`, Tools menu entry with the logo in front of the label.

## Logo design notes

- Container: rounded square, 21.6 units across, 5.6 corner radius, fill `#2E3A59`.
- Diagonal: `/` from the lower-left to the upper-right, `#E8ECF5`, width 1,
  50 % opacity.
- Sun: upper-left, `#F6A623`; moon: lower-right, `#8FB6FF`; both 6.4 × 6.4 boxes.
- Verified by rendering the SVG at 16 / 24 / 32 / 48 / 64 / 96 / 128 px on light and
  dark backgrounds.

## Verification performed

1. **Build** — `./scripts/build.sh` produces `dist/theme-toggle-1.1.3.xpi` with
   `manifest.json` at the archive root.
2. **Install** — installed over 1.1.2 in a live Zotero 10.0.8; the add-on reports
   version `1.1.3`, state *active*, no restart required.
3. **Menu item** — the Tools popup entry still renders as an iconic item with the
   plugin logo before the label.
4. **Regression** — toolbar button, shortcut and menu command still toggle
   `browser.theme.toolbar-theme` `0 ↔ 1` with an immediate UI repaint.
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
[`theme-toggle-v1.1.3`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.1.3).
