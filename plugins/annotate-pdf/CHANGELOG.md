# Changelog

All notable changes to the **Annotate PDF** plugin are documented here.
This project uses semantic versioning; release tags are `annotate-pdf-v<version>`.

## [1.0.5] — 2026-11-19

### Added
- **PDFs annotated in other apps are taken over instead of refused.** If the file
  already carries annotations that were not written by this item (made in another
  PDF app, or coming from another library), the in-place write now first runs
  Zotero's own "Import Annotations…" round trip: those annotations become normal,
  editable database annotations and the file is stripped of them; copies created
  for annotations this item already has are dropped again, so nothing is
  duplicated. The read-only ("external") items Zotero creates when you open an
  externally edited file are superseded by the same flow. The file then gets a
  single clean copy of everything.
  New preference `adoptForeignAnnotations` (default `true`); set it to `false` to
  restore the previous behaviour (refuse and suggest *Save Annotated Copy*).

## [1.0.4] — 2026-11-19

### Fixed
- **Menu icon, second attempt.** With 1.0.3 the icon was correct in the DOM
  (class `menuitem-iconic`, `--custom-menu-icon-light/dark` set, PNG decodable)
  yet still showed as an empty box. Two changes:
  - the icon files were renamed (`icon-menu.png` / `icon-menu-dark.png`) so the
    image cache cannot keep serving the old bytes for the same URL;
  - the `onShowing` hook now additionally sets the `src` of the item's icon
    `<image>` directly, instead of relying only on Zotero resolving the CSS
    variables.

## [1.0.3] — 2026-11-19

### Fixed
- **`this._worker is null` on the first write after starting Zotero.** Zotero
  creates its PDF worker lazily, only from `_enqueue()`/`_processQueue()`; the
  pre-write check that reads the file's embedded annotations calls the worker
  directly, so it failed when no PDF operation had run yet. The worker is now
  initialized first, with a public-API fallback for future Zotero versions.
  (Failed attempts changed nothing: the error happened before any write.)
- **Menu icon invisible.** Zotero picks `--custom-menu-icon-light/dark` from the
  color-scheme preference, while popup menus are drawn with the platform's
  (light) menu colors — so a theme-adaptive monochrome icon could end up with
  white-on-white contrast. The PNG icons now carry their own colors (accent-blue
  page with yellow highlight bars) and are visible on light and dark menus alike.

## [1.0.2] — 2026-11-19

### Fixed
- **Repeated in-place writes no longer stack duplicate annotations.** Zotero's
  annotation writer *appends* to each page's `/Annots` array, so writing the same
  annotations into the same file again (only this plugin does that — Zotero
  itself always exports into a new file) added another copy every time, making
  translucent highlights darker and darker. Before an in-place write, the
  annotations already embedded in the file are now removed via the PDF worker's
  own "transfer" pass (without touching the database) and re-written once. This
  also repairs files that were already written more than once.
- Safety: that removal runs only when every embedded annotation carries a Zotero
  key belonging to this attachment's database annotations. If the file contains
  annotations from elsewhere (made in another reader, or from another library),
  the write is refused with a clear message instead of risking their deletion —
  use *Save Annotated Copy* for such files.
- The success notification reports how many stale annotations were cleaned up.

### Changed
- **Menu icon**: PNG icons (light/dark) instead of an SVG — Zotero's menu icon
  area does not resolve `context-fill`, so the SVG showed up as an empty box.
  `scripts/dev/make-menu-icons.js` regenerates them.
- New preference `backupOnOverwrite` (default `true`): set it to `false` to write
  in place without creating a `<name>.bak.pdf` copy.
- New preference `confirmOverwrite` (default `true`): set it to `false` to skip
  the confirmation prompt for *overwrite* (one-click in-place writing).
- The overwrite confirmation text now states that linked files are never uploaded
  (no sync consequences), while Zotero-stored files may be re-uploaded; with
  backups disabled it warns that the change cannot be undone.

## [1.0.1] — 2026-11-19

### Fixed
- **The context-menu entry now works on library items.** It appears when the
  selection contains a PDF attachment *or* a regular item that has a PDF
  attached; the write then applies to that item's PDF attachments. Previously
  only PDF attachment rows were accepted.
- **Replaced the context-menu submenu with a single entry.** Zotero builds the
  item menu without an `event`, so the plugin's show/hide hook is registered as a
  `popupshowing` listener and only runs from the second open; the submenu could
  therefore show up disabled and would not expand. The entry is now one plain
  item (**Write Annotations to PDF**) that runs the `defaultAction` preference
  (`copy` / `overwrite` / `saveas` / `ask`), the same as the reader toolbar
  button. The per-mode FTL strings were removed.
- When invoked from the context menu with nothing to write, the plugin stays
  silent instead of showing a "select a PDF attachment" alert.

## [1.0.0] — 2026-11-19

First public release.

### Added
- **Item context menu** for PDF attachments (multi-select supported) →
  *Write Annotations to PDF* with three modes:
  - *Save Annotated Copy* — linked files get `<name> (annotated).pdf` next to the
    original; Zotero-stored files get an annotated copy imported as a new
    attachment of the same item (`outputDir` preference can override the target).
  - *Overwrite Original PDF…* — writes into the file itself, after creating a
    `<name>.bak.pdf` backup and asking for confirmation.
  - *Save As…* — save dialog with a prefilled name.
- **PDF reader toolbar button** (injected via `Zotero.Reader`'s `renderToolbar`
  event) that runs the `defaultAction` (copy/overwrite/ask).
- Annotations are written with Zotero's own writer
  (`Zotero.PDFWorker.export(..., transfer = false)`) as real PDF annotation
  objects with appearance streams and `/Zotero:*` round-trip keys; the database
  is never modified by the write.
- After an in-place overwrite the file's modification time is recorded as
  "already processed" (mirroring Zotero's own page operations), so the reader
  does not re-import the embedded annotations as external duplicates.
- `en-US` and `zh-CN` localization; preferences for default action, output
  directory and silent errors; `update.json` + `update_url` for update checks.

### Verified
- Automated end-to-end suite on Zotero 10.0.8 (Windows), for both the dev build
  and the release build (`scripts/dev/tests/annotate-pdf-e2e.js`):
  - copy mode produces a new PDF attachment containing all 3 test annotations;
  - round-trip check: importing the embedded annotations back yields identical
    type, color, comment and rect coordinates (incl. a multi-rect highlight and a
    Chinese comment);
  - overwrite mode: `.bak.pdf` exists, database annotation count unchanged, the
    file contains annotations, and reopening the reader creates no duplicates;
  - linked-file copy lands next to the source with the expected name and content;
  - the reader toolbar button is found in the rendered toolbar (localized title,
    28×28, mask-based icon) and clicking it produces the annotated copy;
  - the context-menu submenu builds with its three items (lazily, as designed);
  - cleanup: all created items/collections/files erased afterwards.
