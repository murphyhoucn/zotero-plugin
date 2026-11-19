# Changelog

All notable changes to the **Annotate PDF** plugin are documented here.
This project uses semantic versioning; release tags are `annotate-pdf-v<version>`.

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
