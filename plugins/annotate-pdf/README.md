# Annotate PDF

<p align="center"><img src="chrome/content/icons/logo.svg" width="96" height="96" alt="Annotate PDF logo — a page with highlighted lines"></p>

A tiny Zotero plugin that writes Zotero's annotations — highlights, underlines,
notes — **into the PDF file itself**, so the paper still carries them when it is
shared, printed, or opened in any other PDF reader. Tested with Zotero 10.0.8
(Zotero 8 series); works on Zotero 8+.

中文说明见下方 [中文](#中文说明)。

## Why

Zotero stores annotations in its database, not in the PDF (intentionally — see
[Annotations in the Zotero database](https://www.zotero.org/support/kb/annotations_in_database)).
Zotero can export an annotated copy (reader *File → Save As…*, library *File →
Export PDF…*), but there is no quick entry for it and no way to update the file
you are actually working with.

This plugin adds exactly that: two entry points and three write modes.

## Features

- **Item context menu** — select a paper (or one or more of its PDF attachments)
  in the library and choose **Write Annotations to PDF**. A regular item is
  expanded to its PDF attachments automatically, so the entry works on the paper
  itself, not only on the file row. What it does is decided by the
  `defaultAction` preference (default: *Save Annotated Copy*):
  - **copy** — keeps the original untouched. Linked files get a
    `<name> (annotated).pdf` next to the original; files stored in Zotero get an
    annotated copy imported as a new attachment of the same item.
  - **overwrite** — writes the annotations into the file itself. A backup named
    `<name>.bak.pdf` is created first. (Zotero removed this capability in
    Zotero 6 because it can cause sync conflicts — see *Caveats* below.)
  - **saveas** — save to a location you pick.
  - **ask** — a small dialog lets you choose between copy and overwrite each time.
- **PDF reader toolbar button** — in the PDF reader's toolbar; runs the same
  `defaultAction`.
- **Batch** — multi-selection is written one file after another with a single
  summary at the end.

The annotations are written as **real PDF annotation objects** (highlight /
underline / sticky note / ink / image / text), with appearance streams and the
same `/Zotero:*` round-trip keys Zotero's own exporter uses. They remain
selectable, they show up in the comments pane, and Zotero can import them again.

## Install

1. Download `annotate-pdf.xpi` from the [latest release](https://github.com/murphyhoucn/zotero-plugin/releases).
2. In Zotero: **Tools → Plugins** → gear icon → **Install Plugin From File…**
3. Select the `.xpi`. No restart needed — the reader button and the menu entry
   appear immediately (already-open reader tabs need to be reopened once).

## Use

1. Annotate a PDF in Zotero as usual.
2. Right-click the attachment (or click the toolbar button in the reader).
3. Pick the mode. Done — the file now carries the annotations.

## Preferences

| Preference | Values | Default | Meaning |
|---|---|---|---|
| `extensions.zotero.annotate-pdf.defaultAction` | `copy` \| `overwrite` \| `saveas` \| `ask` | `copy` | What the menu entry and the reader button do. |
| `extensions.zotero.annotate-pdf.outputDir` | path | *(empty)* | If set, *copy* always writes `<outputDir>/<name> (annotated).pdf` instead of the per-attachment defaults. |
| `extensions.zotero.annotate-pdf.confirmOverwrite` | `true` \| `false` | `true` | Ask for confirmation before writing into the original file. Set to `false` for a one-click overwrite workflow. |
| `extensions.zotero.annotate-pdf.silentErrors` | `true` \| `false` | `false` | Suppress the modal error alert (for scripted/automated use). |

Set them in **Settings → Advanced → Config Editor** (search for `annotate-pdf`).

## How it works

| Piece | Detail |
|---|---|
| Writer | `Zotero.PDFWorker.export(itemID, path, isPriority, password, transfer)` — Zotero's own PDF worker. `transfer` is always `false`, so annotation items are **never removed** from the database. |
| Data | `annotationPosition.rects` are already in unrotated PDF user space (y up), so no coordinate conversion is needed. |
| Menu | `Zotero.MenuManager.registerMenu({ target: "main/library/item" })`, shown only for PDF attachments via `onShowing`. |
| Reader button | `Zotero.Reader.registerEventListener("renderToolbar")`; the button uses a `mask-image` icon so it follows the reader theme. |
| Encrypted PDFs | The password of an already-open reader tab is reused; otherwise a clear error is shown. |
| Overwrite safety | Backup first, then write; afterwards the file's mtime is recorded as "already processed" (exactly like Zotero's own *rotate/delete pages*), so the reader does not re-import the embedded annotations as duplicates. |
| Localization | `locale/en-US`, `locale/zh-CN` (`.ftl`). |

## Reversibility & what Zotero shows

- **The database is never touched.** The plugin always calls Zotero's writer with
  `transfer = false`; the annotation items stay exactly where they were. (Measured:
  after an in-place overwrite the attachment still has all 3 annotations, and
  reopening it does not import duplicates.)
- **The file is written as a snapshot.** Annotations added in Zotero *after* a
  write are not in the PDF until you write again.
- **Copy mode is trivially reversible** — it only creates a new file/attachment;
  delete it and nothing has changed. **Overwrite mode keeps a `<name>.bak.pdf`
  backup**, so restoring the original file undoes the write completely.
- **Removing annotations from a PDF again is Zotero's own round trip**: open the
  annotated PDF in Zotero, and *File → Import Annotations…* moves the embedded
  annotations into the database and strips them from the file. On an annotated
  *copy* they first appear as read-only *external* annotations (lock icon) and
  become editable after that import.
- **Zotero displays the database annotations**, not the ones embedded in the
  file. For an overwritten original that is simply your own annotations
  (editable). For an annotated copy, the file's annotations only show up after
  Zotero imports them — as the read-only external items mentioned above.

## Caveats

- **Overwrite** modifies the file on disk. For **linked** attachments (files in
  your own folder) this has **no sync consequences** — Zotero never uploads
  linked files, it only syncs the link. For files *stored* in Zotero it triggers
  a file re-upload when file sync is on, which is why Zotero removed the feature
  in Zotero 6. In both cases the plugin keeps the database annotations, creates a
  `<name>.bak.pdf` next to the file first, and (by default) asks for
  confirmation — the risk stays with you.
- An annotated **copy** opened in Zotero shows the embedded annotations as
  *external* (read-only, with a lock icon). That is normal Zotero behaviour for
  annotations stored in the file; the database of the copy gets its own items.
- Text (free-text) annotations in CJK scripts may lack an appearance stream in
  other readers — Zotero's writer only embeds a Latin font. Highlights,
  underlines and comments (including Chinese) are not affected.
- Encrypted PDFs need to be opened once in Zotero (so the plugin can reuse the
  password) or they will be reported as unsupported.

## Source layout

```
manifest.json        plugin manifest (Zotero 8 requires applications.zotero.update_url)
bootstrap.js         all plugin logic (menu, reader button, write modes)
chrome/content/icons logo.svg (plugin icon), menu.svg (menu, context-fill), toolbar.svg (reader mask icon)
locale/              en-US, zh-CN FTL strings
update.json          update manifest used by Zotero's update checker
```

Build from the repository root with `./scripts/build.sh`; the result is
`dist/annotate-pdf-<version>.xpi`. Development helpers (a dev-only self-test
channel and the end-to-end suite) live in `scripts/dev/` and are never part of
the release build.

## Compatibility

- Zotero 8.0 – 10.x (`strict_min_version: 8.0`, `strict_max_version: 10.*`)
- Verified on Zotero 10.0.8 (Windows) with an automated end-to-end suite:
  copy / overwrite / linked-file / Save-As dialog paths, annotation round-trip
  (type, color, comment and rect coordinates all match), reader toolbar button,
  context-menu build, and cleanup.

## License

[AGPL-3.0](../../LICENSE) © 2026 murphy

---

## 中文说明

一个极小的 Zotero 插件：把 Zotero 里的**高亮、下划线、便签等标注写进 PDF 文件本身**，
这样把 PDF 发给别人、打印、或用其他阅读器打开时，标注依然在。适用于 Zotero 8+，
已在 Zotero 10.0.8（Windows）上自动化验证。

### 为什么需要它

Zotero 的标注保存在数据库里而不是 PDF 里（官方出于同步性能的考虑，
见 [annotations_in_database](https://www.zotero.org/support/kb/annotations_in_database)）。
官方其实能导出「带标注的副本」（阅读器 文件→另存为…、库 文件→导出 PDF…），但入口深、
每次都要弹保存框，而且**不能写回你正在用的那个文件**。本插件就是补上这一层。

### 功能

- **条目右键菜单**：选中「条目」（论文）或它下面的 PDF 附件，右键 → **写入标注到 PDF**。
  选中条目时会自动找到它的 PDF 附件，所以**在论文条目上也能直接写入**。具体行为由偏好
  `defaultAction` 决定（默认「生成副本」）：
  - **copy（生成「标注版」副本）**：原文件不动。链接的 PDF 在同目录生成
    `<文件名> (annotated).pdf`；Zotero 库内存储的 PDF 作为同一条目下的新附件导入。
  - **overwrite（覆盖原文件）**：把标注直接写进原文件；写前自动备份 `<文件名>.bak.pdf`。
  - **saveas（另存为）**：自己选保存位置。
  - **ask**：每次弹一个小对话框让你选「生成副本 / 覆盖原文件」。
- **阅读器工具栏按钮**：PDF 阅读器顶栏一键执行同一个 `defaultAction`。
- **批量**：可多选，逐个写入，完成后给一份汇总。

写入的是**标准 PDF 注释对象**（高亮/下划线/便签/墨迹等），带外观流和与 Zotero
官方导出相同的 `/Zotero:*` 回传键——可以在别的阅读器里正常显示、放进批注列表，
也能再被 Zotero「导入标注」识别。

### 安装与使用

从 [Releases](https://github.com/murphyhoucn/zotero-plugin/releases) 下载
`annotate-pdf.xpi` → Zotero → 工具 → 插件 → 齿轮 → Install Plugin From File… → 选择
该文件（无需重启）。之后在条目列表右键 PDF 附件，或在阅读器里点顶栏按钮即可。

### 偏好设置（设置 → 高级 → 配置编辑器，搜索 `annotate-pdf`）

| 偏好 | 取值 | 默认 | 说明 |
|---|---|---|---|
| `extensions.zotero.annotate-pdf.defaultAction` | `copy` / `overwrite` / `saveas` / `ask` | `copy` | 菜单项与阅读器按钮执行的动作 |
| `extensions.zotero.annotate-pdf.outputDir` | 目录路径 | 空 | 若设置，`copy` 一律写到该目录 |
| `extensions.zotero.annotate-pdf.confirmOverwrite` | `true`/`false` | `true` | 覆盖原文件前是否弹确认框；设为 `false` 就是"一键覆盖" |
| `extensions.zotero.annotate-pdf.silentErrors` | `true`/`false` | `false` | 静默错误弹窗（脚本化使用） |

### 可逆性与显示（重要）

- **数据库全程不动**：插件始终以 `transfer = false` 调用 Zotero 的写入器，标注条目原样保留
  （实测：覆盖写入后该附件的 3 条标注依然健在，重新打开也不会重复导入）。
- **写入是"快照"**：写完之后再在 Zotero 里新增的标注不会自动同步进 PDF，需要再写一次。
- **副本模式天然可逆**：只是多了一个新文件/新附件，删掉即可；**覆盖模式会自动留
  `<文件名>.bak.pdf` 备份**，恢复备份就等于完全撤销写入。
- **想把标注从 PDF 里再"拿回来"**，用 Zotero 自带的反向操作：用 Zotero 打开带标注的 PDF，
  「文件 → 导入标注…」会把文件里的标注搬进数据库并**从文件里删除**。对"标注版副本"，
  它们会先以**只读外部标注（带锁图标）**出现，执行该导入后才变为可编辑。
- **Zotero 界面里显示的是数据库里的标注**，不是 PDF 文件里那份。覆盖过的原文件显示的
  就是你原来的标注（可编辑、无锁）；而副本里的标注只有在 Zotero 导入后才会显示出来
  （且显示为上述只读状态）。

### 注意事项

- **覆盖原文件**会真实修改磁盘上的文件。对**链接附件**（PDF 在你自己的文件夹里，
  例如 `baseAttachmentPath` 指向的目录）**没有同步影响**——Zotero 从不上传链接文件，
  只同步链接本身；只有"库内存储"的 PDF 在开启文件同步时会重新上传（这正是官方当年
  移除该功能的原因）。两种情况下插件都会保留数据库标注、先在文件旁生成
  `<文件名>.bak.pdf` 备份、默认弹一次确认框——风险请自行评估。
- 生成的**副本**用 Zotero 打开时，文件里的标注会显示为「外部（只读）」并带锁形图标，
  这是 Zotero 的正常设计。
- 中文的**文字批注（text 类型）**在外部阅读器可能没有外观流（Zotero 写入器只嵌入拉丁字体）；
  高亮、下划线和**中文评论**不受影响。
- 加密 PDF：请先在 Zotero 阅读器中输入密码打开一次，插件会复用该密码。

### 卸载

工具 → 插件 → 找到「Annotate PDF」→ Remove。已写入 PDF 的标注和备份文件不受影响。
