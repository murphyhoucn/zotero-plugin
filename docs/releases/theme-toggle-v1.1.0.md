# Theme Toggle v1.1.0 — Release Report

| | |
|---|---|
| Release tag | `theme-toggle-v1.1.0` |
| Release date | 2026-11-19 |
| Plugin ID | `theme-toggle@local` |
| Artifact | [`theme-toggle.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.0/theme-toggle.xpi) |
| SHA-256 | `44cfa3d21031bae9a84e3fa72a1713f36590bcb96a46ddc925c2dd57d61c78a5` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

Version 1.1.0 gives the plugin a proper **logo** — a capsule (toggle) outline with a
sun on the left, a slash in the middle and a crescent moon on the right — and uses it
as the add-on icon shown in Zotero's Plugins Manager. Functionality is unchanged
from 1.0.2.

## Changing in this release

- **New logo** — `chrome/content/icons/logo.svg`: reads as
  “☀ / ☾ inside a toggle pill”, i.e. exactly what the plugin does.
- **Manifest icons** now point to `logo.svg` (48 px / 96 px entries), so the logo
  appears next to “Theme Toggle” in the Plugins Manager and on its detail page.
- **README** shows the logo at the top; a size preview is kept in
  `docs/images/theme-toggle-logo-preview.png`.
- Toolbar icons are intentionally unchanged: `sun.svg` / `moon.svg` remain monochrome
  (theme-tinted via `context-fill`) because they indicate the *action* a click
  performs, while the logo identifies the plugin.

## Logo design notes

- Geometry: a 22.2 × 13.2 capsule on a 24 × 24 grid; sun on the left, `/` slash in
  the middle, crescent moon on the right.
- The sun and the moon occupy **equal 6.0 × 6.0 boxes** — neither is larger than the
  other — and both reuse the glyph shapes already used by the plugin's toolbar icons.
  Elements are kept compact inside the capsule (≈1 px end padding, ≈2 px gaps around
  the slash) so the mark does not look crowded.
- The moon keeps the stock crescent orientation (horns towards the top-right): it is
  **not mirrored and not rotated**.
- Palette: sun `#F6A623`, moon `#5B8DEF`, capsule and slash `#7C879E` — three flat
  colours, no gradients, chosen so the mark stays visible on both light and dark
  backgrounds (Zotero's Plugins Manager uses a dark card in dark mode).
- Verified by rendering the SVG at 16 / 24 / 32 / 48 / 64 / 96 / 128 px on light and
  dark backgrounds before release.

## Verification performed

1. **Build** — `./scripts/build.sh` produces `dist/theme-toggle-1.1.0.xpi` with
   `manifest.json` at the archive root; `logo.svg` is included.
2. **Install** — installed in a live Zotero 10.0.8 through the Plugins Manager
   (gear → Install Plugin From File…); the add-on reports version `1.1.0`, state
   *active*, no restart required.
3. **Icon** — the capsule logo is rendered by Zotero next to “Theme Toggle” in the
   Plugins Manager (checked in both light and dark UI).
4. **Regression** — toolbar button, `Ctrl/Cmd+Shift+D` shortcut and the Tools menu
   entry still work; toggling still switches `browser.theme.toolbar-theme` `0 ↔ 1`
   and the UI repaints immediately.
5. **Checksum** — the published artifact's SHA-256 matches the locally built file.

## Installation

1. Download `theme-toggle.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file. Existing installations of 1.0.x are upgraded in place; no restart.

## Files in this release

| File | Description |
|---|---|
| `theme-toggle.xpi` | Installable plugin package |

Source code for this release is available at tag
[`theme-toggle-v1.1.0`](https://github.com/murphyhoucn/zotero-plugin/tree/theme-toggle-v1.1.0).
