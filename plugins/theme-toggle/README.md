# Theme Toggle

A tiny Zotero plugin that switches Zotero's **native** light/dark color scheme from
outside the Settings window. Tested with Zotero 10.0.8 (Zotero 8 series); works on
Zotero 8+.

中文说明见下方 [中文](#中文说明)。

## Features

- **Toolbar button** — a sun/moon icon in the top toolbar, just left of the sync button.
- **Keyboard shortcut** — `Ctrl+Shift+D` (macOS: `Cmd+Shift+D`).
- **Tools menu item** — Tools → Toggle Light/Dark Mode.

Each trigger switches to the opposite explicit mode. No third-party themes are
installed: the plugin only writes Zotero's own color-scheme preference
(`browser.theme.toolbar-theme`: `0` = Dark, `1` = Light, `2` = Follow system), so the
result is identical to picking Light/Dark in **Settings → General → Color Scheme** —
and it applies **instantly, without restarting Zotero**.

If you want "follow system" back, choose **Automatic** in Settings; the native option
is left untouched.

## Install

1. Download `theme-toggle.xpi` from the [latest release](https://github.com/murphyhoucn/zotero-plugin/releases).
2. In Zotero: **Tools → Plugins** → gear icon → **Install Plugin From File…**
3. Select the `.xpi`. No restart needed — the toolbar button appears immediately.

## Uninstall

**Tools → Plugins** → find **Theme Toggle** → **Remove**. The native color-scheme
setting is left in whatever state it was in.

## How it works

| Piece | Detail |
|---|---|
| Preference | `browser.theme.toolbar-theme` (`0` dark / `1` light / `2` system) |
| Instant apply | Gecko registers this pref for a full theme refresh, so the UI repaints as soon as it changes |
| Toolbar button | Injected into `#zotero-tabs-toolbar`, styled with Zotero's own `.zotero-tb-button` class and `context-fill` SVG icons |
| Shortcut | Capture-phase `keydown` listener on the main window (`Ctrl/Cmd+Shift+D`) |
| Menu item | Registered through Zotero 8's `Zotero.MenuManager` (`main/menubar/tools`) |
| Localization | `locale/en-US`, `locale/zh-CN` (`.ftl`), loaded with `MozXULElement.insertFTLIfNeeded()` |
| Updates | `update_url` → `update.json` in this repository |

## Source layout

```
manifest.json        plugin manifest (Zotero 8 requires applications.zotero.update_url)
bootstrap.js         all plugin logic (startup/shutdown + window setup)
chrome/content/icons moon.svg / sun.svg (20×20, context-fill)
locale/              en-US, zh-CN FTL strings
update.json          update manifest used by Zotero's update checker
```

Build from the repository root with `./scripts/build.sh`; the result is
`dist/theme-toggle-<version>.xpi`.

## Compatibility

- Zotero 8.0 – 10.x (`strict_min_version: 8.0`, `strict_max_version: 10.*`)
- Verified on Zotero 10.0.8 (Windows), including live install/upgrade without restart.

## License

[AGPL-3.0](../../LICENSE) © 2026 murphy

---

## 中文说明

一个极小的 Zotero 插件：把「设置 → 通用 → 颜色方案」里的 Light/Dark 切换搬到外面，
提供三种入口：

- 顶部标签栏右侧的**工具栏按钮**（月亮/太阳图标，位置在同步按钮左边）
- 快捷键 **Ctrl+Shift+D**（macOS 为 Cmd+Shift+D）
- **工具（Tools）菜单**里的「切换深色/浅色模式」

切换的是 Zotero 原生的配色偏好 `browser.theme.toolbar-theme`（0=深色，1=浅色，2=跟随系统），
不引入任何第三方主题，效果与设置里选择 Light/Dark 完全一致，且**立即生效、无需重启**。

每次点击会切到「当前的相反模式」；如果想恢复「跟随系统」，仍可在设置里选择 Automatic。

### 安装

1. 从 [Releases](https://github.com/murphyhoucn/zotero-plugin/releases) 下载 `theme-toggle.xpi`
2. Zotero → 工具（Tools）→ 插件（Plugins）→ 右上角齿轮 → Install Plugin From File…
3. 选择 `theme-toggle.xpi`，无需重启

### 卸载

工具 → 插件 → 找到「Theme Toggle」→ Remove。
