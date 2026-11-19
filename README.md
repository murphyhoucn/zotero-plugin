# Zotero Plugins

A small collection of focused plugins for **Zotero 8+**, by [murphy](https://github.com/murphyhoucn).
Each plugin is independent, does one thing, and lives in its own directory under `plugins/`.

Every plugin targets Zotero's built-in features — no third-party themes, no background
services, no telemetry.

## Plugins

| Plugin | What it does | Version | Download |
|---|---|---|---|
| [Theme Toggle](plugins/theme-toggle) | Switch Zotero's native light/dark color scheme from a toolbar button or `Ctrl/Cmd+Shift+D` — instantly, no restart. | 1.1.4 | [theme-toggle.xpi](https://github.com/murphyhoucn/zotero-plugin/releases/download/theme-toggle-v1.1.4/theme-toggle.xpi) |
| [Annotate PDF](plugins/annotate-pdf) | Write Zotero's annotations into the PDF file itself — annotated copy, in-place overwrite (with backup), or Save As; from the item context menu or the PDF reader toolbar. Merges annotations made in other PDF apps and cleans up read-only leftovers. | 1.0.7 | [annotate-pdf.xpi](https://github.com/murphyhoucn/zotero-plugin/releases/download/annotate-pdf-v1.0.7/annotate-pdf.xpi) |

## Install a plugin

1. Download the plugin's `.xpi` from the [Releases](https://github.com/murphyhoucn/zotero-plugin/releases) page.
2. In Zotero, open **Tools → Plugins**.
3. Click the gear icon → **Install Plugin From File…** and select the `.xpi`.
4. The plugin is active immediately; no restart is required.

Plugins in this repository declare an `update_url`, so Zotero's automatic update check
can pick up future releases from this repository.

## Repository layout

```
plugins/
  theme-toggle/        # Theme Toggle source (manifest.json, bootstrap.js, chrome/, locale/)
  annotate-pdf/        # Annotate PDF source (writes Zotero annotations into the PDF)
scripts/
  build.sh             # builds every plugin into dist/
  dev/                 # dev-only tooling: self-test channel + end-to-end suite
dist/                  # build output (git-ignored; artifacts are attached to Releases)
```

## Build

Requirements: `zip`.

```bash
./scripts/build.sh
```

The script builds each `plugins/<name>` into `dist/<name>-<version>.xpi`.

## Adding a new plugin

1. Create `plugins/<plugin-name>/` with `manifest.json`, `bootstrap.js` and any assets.
2. Zotero 8 **requires** `applications.zotero.update_url` in the manifest — installation
   fails with “could not be installed / may be incompatible” if it is missing.
3. Add `locales/<locale>/*.ftl` for translations (Zotero registers them automatically,
   so `MozXULElement.insertFTLIfNeeded(name)` in the main window works).
4. Run `./scripts/build.sh`, install the result, and extend this README's plugin table.
5. Tag releases as `<plugin-name>-v<version>` and attach the built `.xpi`.

## Credits

- Plugin scaffolding follows the Zotero 7/8 plugin conventions
  ([Make It Red](https://github.com/zotero/make-it-red), community plugin templates).
- Thanks to the Zotero community for documenting the plugin APIs.

## License

[AGPL-3.0](LICENSE) © 2026 murphy

---

## 中文说明

这是 [murphy](https://github.com/murphyhoucn) 的 Zotero 插件合集（Zotero 8+）。
每个插件相互独立、只做一件事，放在 `plugins/` 下各自的目录里；全部基于 Zotero 原生能力，
不引入第三方主题、不常驻后台、无遥测。

当前包含：

- **[Theme Toggle](plugins/theme-toggle)**：一键切换 Zotero 原生深色/浅色配色
  （工具栏按钮 / `Ctrl+Shift+D`），立即生效、无需重启。
- **[Annotate PDF](plugins/annotate-pdf)**：把 Zotero 标注写进 PDF 文件本身——
  生成「标注版」副本 / 覆盖原文件（自动备份） / 另存为；入口在条目右键菜单和
  PDF 阅读器工具栏，支持批量。

安装方法：从 [Releases](https://github.com/murphyhoucn/zotero-plugin/releases) 下载 `.xpi`，
在 Zotero 里打开 **工具 → 插件 → 齿轮 → Install Plugin From File…** 选择该文件即可，无需重启。

源码构建：在本仓库根目录执行 `./scripts/build.sh`，产物在 `dist/` 下。
新增插件请放入 `plugins/<插件名>/`，注意 Zotero 8 要求 manifest 中声明
`applications.zotero.update_url`，否则会安装失败。
