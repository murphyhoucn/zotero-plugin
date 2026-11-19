# Annotate PDF v1.0.0 — Release Report

| | |
|---|---|
| Release tag | `annotate-pdf-v1.0.0` |
| Release date | 2026-11-19 |
| Plugin ID | `annotate-pdf@local` |
| Artifact | [`annotate-pdf.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/annotate-pdf-v1.0.0/annotate-pdf.xpi) |
| SHA-256 | `8cbbaeff8783455dcf8a4debccf3815182033e764952f521dbad9caab294aa51` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

First release of **Annotate PDF**. Zotero keeps annotations in its database, not
in the PDF, so a shared or externally-opened paper loses them. This plugin writes
them into the PDF file itself and adds the missing quick entries: the item
context menu (multi-select) and a button in the PDF reader toolbar.

Three write modes:

- **Save Annotated Copy** — original untouched; linked files get
  `<name> (annotated).pdf` next to the original, Zotero-stored files get an
  annotated copy imported as a new attachment of the same item.
- **Overwrite Original PDF…** — writes into the file itself, after creating a
  `<name>.bak.pdf` backup and a confirmation prompt.
- **Save As…** — a normal save dialog.

## How it is implemented

The plugin does **not** re-implement PDF writing. Zotero already ships the
writer: `Zotero.PDFWorker.export(itemID, path, isPriority, password, transfer)`
(the same code behind the reader's *File → Save As…* and the library's
*File → Export PDF…*). It embeds real PDF annotation objects with appearance
streams and `/Zotero:*` round-trip keys, so the result is readable in any PDF
viewer and re-importable into Zotero.

Notes on the integration:

- `transfer` is always `false` — annotation items are **never erased** from the
  database (that would be Zotero 6's removed *Store Annotations in File*
  behaviour).
- `annotationPosition.rects` are already in unrotated PDF user space (y up), so
  no coordinate conversion is involved.
- After an in-place overwrite the new file mtime is recorded with
  `attachmentLastProcessedModificationTime`, mirroring Zotero's own
  `deletePages`/`rotatePages` code, so the reader does not re-import the embedded
  annotations as external duplicates on the next open.
- Menu registration uses `Zotero.MenuManager` (`target: main/library/item`,
  `onShowing` hides it unless PDF attachments are selected); the reader button is
  injected through `Zotero.Reader`'s `renderToolbar` event and uses a
  `mask-image` icon so it follows the reader theme.
- The context menu is a submenu (*Write Annotations to PDF ▸ …*); its items are
  built lazily by Zotero on `popupshowing`, which is the documented behaviour.

## Verification performed

### Build

- `./scripts/build.sh` produces `dist/annotate-pdf-1.0.0.xpi` (11.6 KB, 13
  files), `manifest.json` at the archive root; no dev-only files inside
  (`chrome/content/dev-selftest.js` is only injected by
  `scripts/dev/build-dev.sh`).
- Live install through `AddonManager.getInstallForFile(...).install()` in a
  running Zotero 10.0.8: add-on reports `1.0.0`, state *active*, no restart.

### End-to-end suite

`scripts/dev/tests/annotate-pdf-e2e.js` (driven through the dev-only self-test
channel; the same suite was then re-run against the **release** build through
Zotero's *Run JavaScript* console). It creates a scratch collection with generated
test PDFs, exercises every path and erases everything afterwards. Final report
from the release build:

```json
{
  "suite": "annotate-pdf-e2e",
  "failed": [],
  "steps": [
    { "name": "env",                       "ok": true },
    { "name": "purge-leftovers",           "ok": true },
    { "name": "import-test-pdf",           "ok": true },
    { "name": "add-annotations",           "ok": true },
    { "name": "copy-mode",                 "ok": true },
    { "name": "copy-info",                 "ok": true },
    { "name": "roundtrip-from-copy",       "ok": true },
    { "name": "overwrite-mode",            "ok": true },
    { "name": "overwrite-effects",         "ok": true },
    { "name": "reader-open-original",      "ok": true },
    { "name": "reader-toolbar-button",     "ok": true },
    { "name": "menu-popup-build",          "ok": true },
    { "name": "linked-file-copy",          "ok": true },
    { "name": "linked-copy-content-check", "ok": true },
    { "name": "cleanup",                   "ok": true }
  ]
}
```

Key evidence from the individual steps:

- **copy mode** — 3 annotations exported; result
  `{ status: "ok", count: 3, itemID: 15579, "isPDFAttachment": true }`, file
  `annotate-pdf-test (annotated).pdf` created in Zotero storage.
- **round-trip** — importing the annotations embedded in that copy back into
  Zotero yields 3 annotations whose `type`, `color`, `comment` and **rect
  coordinates** all match the originals exactly, including a two-rect highlight
  (`100,500,300,512;110,520,280,532`) and a Chinese comment (`评论 1`).
- **overwrite mode** — `{ status: "ok", count: 3 }` plus backup
  `annotate-pdf-test.bak.pdf`; database annotation count stays 3;
  `Zotero.PDFWorker.hasAnnotations()` reports `true` for the file.
- **no duplicate imports** — opening the overwritten file in the reader leaves
  the annotation count at 3 → 3 (`attachmentLastProcessedModificationTime`
  handling works).
- **reader toolbar button** — found in the rendered toolbar (localized title
  *Write annotations to PDF*, class `toolbar-button`, size 28×28, `mask-image`
  loaded from `chrome://annotate-pdf/content/icons/toolbar.svg`); a programmatic
  click produced a new annotated attachment.
- **context menu** — the submenu (`dataset.l10nId = annotate-pdf-menu`) is
  injected into `main/library/item`, and dispatching `popupshowing` builds its
  three items (`annotate-pdf-menu-copy`, `-overwrite`, `-saveas`).
- **linked-file copy** — output written next to the source as
  `annotate-pdf-linked (annotated).pdf`; re-importing it yields the 1 annotation
  with matching rects.
- **cleanup** — 8 annotations, 5 items and 3 files erased; no leftovers.

Not covered automatically: the **Save As…** file dialog (needs user interaction);
its code path shares the same export call, and the dialog was exercised manually
during development.

## Known limitations

- Overwriting a file that is under Zotero file sync triggers a re-upload; Zotero
  removed this capability in Zotero 6 for exactly this reason. The plugin keeps
  database annotations, creates `.bak.pdf`, and asks first — but the risk stays
  with the user.
- An annotated *copy* opened in Zotero shows its embedded annotations as
  external/read-only (lock icon) — normal Zotero behaviour.
- CJK free-text annotations may lack an appearance stream in non-Zotero readers
  (Zotero's writer embeds only a Latin font); highlights, underlines and comments
  are unaffected.
- Encrypted PDFs: the plugin reuses the password of an already-open reader tab;
  otherwise it reports an error.

## Installation

1. Download `annotate-pdf.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file. The plugin is active immediately; the reader button appears in
   newly opened PDF tabs.

## Files in this release

| File | Description |
|---|---|
| `annotate-pdf.xpi` | Installable plugin package |

Source code for this release is available at tag
[`annotate-pdf-v1.0.0`](https://github.com/murphyhoucn/zotero-plugin/tree/annotate-pdf-v1.0.0).
