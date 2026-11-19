# Annotate PDF v1.0.7 — Release Report

| | |
|---|---|
| Release tag | `annotate-pdf-v1.0.7` |
| Release date | 2026-11-19 |
| Plugin ID | `annotate-pdf@local` |
| Artifact | [`annotate-pdf.xpi`](https://github.com/murphyhoucn/zotero-plugin/releases/download/annotate-pdf-v1.0.7/annotate-pdf.xpi) |
| SHA-256 | `d281eddc0d1e659328fbd92cca6e32dc208bb1b1fbc4742a4915ec7319e1bfb7` |
| Compatibility | Zotero 8.0 – 10.x (verified on Zotero 10.0.8, Windows 11) |
| License | AGPL-3.0 |

## Summary

First feature-complete release after 1.0.0; it contains all fixes from 1.0.1 to
1.0.7. The plugin writes Zotero's annotations into the PDF file itself, with two
entries (item context menu, PDF reader toolbar) and three write modes (annotated
copy / in-place overwrite / save as). Key additions since 1.0.0:

- **In-place writes are idempotent** — Zotero's writer *appends* to each page's
  `/Annots`, so writing the same file again used to stack another copy of every
  annotation (translucent highlights got darker each time). Each write now first
  removes the annotations a previous write left in the file, then writes one
  clean set; files that were written several times are repaired by the next write.
- **Annotations made in other PDF apps are merged**, not refused: they are
  imported into Zotero as editable annotations (Zotero's own *Import
  Annotations…* round trip) and written back once.
- **Read-only leftovers are cleaned up**: the locked ("external") items Zotero
  creates whenever an annotated file is opened are moved to the trash when they
  duplicate an editable annotation; read-only items without a counterpart in the
  file are converted into editable annotations rather than being lost.
- **`this._worker is null`** on the first write after starting Zotero is fixed
  (the PDF worker is initialized before it is used directly).
- **The menu entry works on library items** (a regular item is expanded to its
  PDF attachments) and is a single plain entry; its marker is a `🖍️` glyph in
  front of the label, which always renders (`menuIconStyle=image` switches to the
  PNG-icon approach), applied from the first menu open.
- New preferences: `defaultAction`, `outputDir`, `backupOnOverwrite`,
  `confirmOverwrite`, `adoptForeignAnnotations`, `menuIconStyle`, `silentErrors`.

## Verification

**Automated end-to-end suite** (`scripts/dev/tests/annotate-pdf-e2e.js`, dev
build driven through the plugin's own file channel; also run against release
builds) — final run `failed: []`, covering:

| Step | Evidence |
|---|---|
| repeat overwrite, no stacking | `markersBefore: 3 → markersAfter: 3`, `strippedEmbedded: 3` |
| adopt externally made annotations | `adopted: 1, dbExternal: 0, foreignNowEditable: true, embeddedCount: 2` |
| trash read-only duplicates | `externalsBefore: 3, trashed: 3, externalsAfter: 0` |
| cold PDF worker | `status: ok, workerAlive: true` |
| overwrite with backup | `.bak.pdf` created, DB count unchanged, file has annotations |
| reader toolbar button | found in the rendered toolbar, click produced the annotated copy |
| menu build + marker | item is a `menuitem`, hidden without PDFs, label `🖍️ Write Annotations to PDF` |
| annotation round trip | imported annotations match type/color/comment/rects exactly |
| linked-file copy | written next to the source, content verified |
| cleanup | all test items/collections/files removed afterwards |

**Real library run** (user's Zotero 10.0.8, 5,307 annotations): 39 papers that
carried read-only leftovers were fixed in place via the same code path; final
scan `attachmentsWithExternal: 0`, no read-only annotations left, every
annotation editable, single copies in the files.

**Artifact**: the published `annotate-pdf.xpi` downloads with SHA-256 matching
the local build, and is byte-identical to the build installed in the verifying
Zotero instance.

## Installation

1. Download `annotate-pdf.xpi` from this release.
2. In Zotero: **Tools → Plugins → gear icon → Install Plugin From File…**
3. Select the file; no restart is needed.

Source code for this release is available at tag
[`annotate-pdf-v1.0.7`](https://github.com/murphyhoucn/zotero-plugin/tree/annotate-pdf-v1.0.7).
