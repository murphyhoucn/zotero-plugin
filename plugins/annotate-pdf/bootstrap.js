/*
 * Annotate PDF for Zotero
 *
 * Writes the annotations stored in Zotero's database into the PDF file itself,
 * so a shared or externally-opened PDF carries the highlights, underlines and
 * notes. Two entries: the item context menu (PDF attachments) and a button in
 * the PDF reader toolbar.
 *
 * Implementation note: the plugin does NOT write PDFs itself. Zotero ships a
 * built-in writer — `Zotero.PDFWorker.export(itemID, path, isPriority,
 * password, transfer)` — which embeds real PDF annotation objects with
 * appearance streams and `/Zotero:Key` round-trip keys (the same writer behind
 * the reader's "Save As…" and the library's "Export PDF…").
 *
 * We always pass `transfer = false`: `transfer = true` would *erase* the
 * annotation items from the database after writing (Zotero 6's removed "Store
 * Annotations in File" behavior) and is never safe.
 *
 * Annotation position data (`annotationPosition.rects`) is already in
 * unrotated PDF user space (y up), so no coordinate conversion is needed.
 */

"use strict";

var chromeHandle;
var annotatePdfReaderHandler;
var annotatePdfDevCleanup;

const ADDON_REF = "annotate-pdf";
const PLUGIN_ID = "annotate-pdf@local";
const FTL_FILE = "annotate-pdf.ftl";

const PREF_PREFIX = "extensions.zotero.annotate-pdf.";
const MENU_ID = "annotate-pdf-menu";
const READER_BUTTON_ID = "annotate-pdf-reader-button";
const ITEM_MENU_ID = "zotero-itemmenu";
const ITEM_MARKER_CLASS = "annotate-pdf-menu-item";
// Glyph shown in front of the menu label when menuIconStyle = "glyph"
const MENU_GLYPH = "🖍️";

const SUFFIX_EN = " (annotated)";
const SUFFIX_ZH = "（标注版）";
const BACKUP_SUFFIX = ".bak.pdf";
const COPY_TMP_SUBDIR = "annotate-pdf";

/* Fallback strings (en, zh) for when the FTL file is not available. */
const FALLBACK_STRINGS = {
	"annotate-pdf-menu": ["Write Annotations to PDF", "写入标注到 PDF"],
	"annotate-pdf-menu-copy": ["Save Annotated Copy", "生成「标注版」副本"],
	"annotate-pdf-menu-overwrite": ["Overwrite Original PDF…", "覆盖原 PDF 文件…"],
	"annotate-pdf-menu-saveas": ["Save As…", "另存为…"],
	"annotate-pdf-toolbar-tip": ["Write annotations to PDF", "写入标注到 PDF"],
	"annotate-pdf-alert-title": ["Annotate PDF", "标注写入 PDF"],
	"annotate-pdf-selection-empty": [
		"Select one or more PDF attachments first.",
		"请先选择一个或多个 PDF 附件。",
	],
	"annotate-pdf-done-headline": ["Annotations written to the PDF", "标注已写入 PDF"],
	"annotate-pdf-done-copy": ["Saved annotated copy:", "已生成标注版副本："],
	"annotate-pdf-done-overwrite": ["Updated original file:", "已写回原文件："],
	"annotate-pdf-done-backup": ["Backup saved as { $path }", "备份：{ $path }"],
	"annotate-pdf-no-annotations": [
		"Skipped \"{ $title }\": no annotations",
		"已跳过「{ $title }」：没有标注",
	],
	"annotate-pdf-no-file": [
		"\"{ $title }\": PDF file not found",
		"「{ $title }」：找不到 PDF 文件",
	],
	"annotate-pdf-confirm-overwrite-title": ["Overwrite the original PDF?", "覆盖原 PDF 文件？"],
	"annotate-pdf-confirm-overwrite-text": [
		"The annotations will be written directly into { $count } PDF file(s). A backup named \"<name>.bak.pdf\" is created first. Zotero-stored files may be re-uploaded if file sync is on; linked files are never uploaded. Continue?",
		"将把标注直接写入 { $count } 个 PDF 文件（写前自动备份为「文件名.bak.pdf」；库内存储的文件若在文件同步中会重新上传，链接文件不受影响）。是否继续？",
	],
	"annotate-pdf-confirm-overwrite-text-nobackup": [
		"The annotations will be written directly into { $count } PDF file(s). No backup is created, so the change cannot be undone. Continue?",
		"将把标注直接写入 { $count } 个 PDF 文件（不会生成备份，修改不可撤销）。是否继续？",
	],
	"annotate-pdf-ask-title": ["Write annotations to PDF", "写入标注到 PDF"],
	"annotate-pdf-ask-text": [
		"How should the annotations be written into the file?",
		"选择写入方式：",
	],
	"annotate-pdf-ask-copy": ["Save Annotated Copy", "生成副本"],
	"annotate-pdf-ask-overwrite": ["Overwrite Original", "覆盖原文件"],
	"annotate-pdf-error-title": ["Annotate PDF: error", "标注写入失败"],
	"annotate-pdf-error-foreign-annotations": [
		"The file already contains { $count } annotation(s) that were not written by this item in Zotero. To avoid deleting them the file was left unchanged — use \"Save Annotated Copy\" instead, or import those annotations into Zotero first.",
		"文件中已存在 { $count } 条不是由本条目在 Zotero 写入的标注。为避免误删，本次未修改文件；请改用「生成副本」，或先把这些标注导入 Zotero 再试。",
	],
	"annotate-pdf-done-cleaned": [
		"Removed { $count } annotation(s) left by a previous write",
		"已清理上次写入遗留的 { $count } 条标注",
	],
	"annotate-pdf-done-adopted": [
		"Imported { $count } annotation(s) from the file into Zotero (now editable)",
		"已把文件里 { $count } 条外部标注导入 Zotero（现在可编辑）",
	],
	"annotate-pdf-done-trashed": [
		"Moved { $count } duplicate read-only annotation(s) to the trash",
		"已把 { $count } 条重复的只读标注移入回收站",
	],
	"annotate-pdf-error-encrypted": [
		"The PDF is encrypted. Open it once in Zotero (and enter its password), then try again.",
		"该 PDF 已加密。请在 Zotero 中打开它并输入密码后重试。",
	],
	"annotate-pdf-error-generic": [
		"Failed to write annotations: { $message }",
		"写入标注失败：{ $message }",
	],
};

/* Internals exposed for the dev self-test channel (see scripts/dev/). */
var AnnotatePDF = {
	writeForAttachment,
	writeCopy,
	writeOverwrite,
	writeSaveAs,
	runAction,
	runActionForItem,
	selectedItems,
	selectedPDFAttachments,
	expandToPDFAttachments,
	readEmbeddedAnnotations,
	stripPreviousEmbeddedAnnotations,
	removeEmbeddedAnnotations,
	ensurePDFWorker,
	annotationCount,
	annotatedBaseName,
	uniqueFilePath,
	getDefaultAction,
	getOutputDir,
	getString,
	isZhLocale,
	isPDFAttachment,
	menuRegistration: null,
};

/* ------------------------------------------------------------------ */
/* Lifecycle                                                          */
/* ------------------------------------------------------------------ */

async function startup({ id, version, resourceURI, rootURI }, reason) {
	await Zotero.initializationPromise;

	if (!rootURI) {
		rootURI = resourceURI.spec;
	}

	const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Components.interfaces.amIAddonManagerStartup);
	const manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", ADDON_REF, rootURI + "chrome/content/"],
	]);

	try {
		await Zotero.uiReadyPromise;
	}
	catch (e) {
		// Ignore
	}

	registerPrefDefaults();

	for (let win of Zotero.getMainWindows()) {
		setupWindow(win);
	}

	AnnotatePDF.menuRegistration = registerMenus();
	registerReaderToolbar();

	// Expose the internals for debugging/scripting (and for the dev channel)
	try {
		Zotero.AnnotatePDF = AnnotatePDF;
	}
	catch (e) {
		Zotero.logError(e);
	}

	// Dev-only self-test channel. scripts/dev/build-dev.sh injects
	// chrome/content/dev-selftest.js into the dev XPI; the release package
	// doesn't contain that file, so the load below fails and is ignored.
	try {
		const devScope = {
			AnnotatePDF,
			Zotero,
			Services,
			IOUtils,
			PathUtils,
			Cc: Components.classes,
			Ci: Components.interfaces,
			Components,
			ChromeUtils,
			registerCleanup(fn) {
				annotatePdfDevCleanup = fn;
			},
		};
		const devUrl = `chrome://${ADDON_REF}/content/dev-selftest.js`;
		const devLoader = Services.scriptloader;
		if (typeof devLoader.loadSubScriptWithOptions === "function") {
			devLoader.loadSubScriptWithOptions(devUrl, { target: devScope, charset: "UTF-8", cache: false });
		}
		else {
			devLoader.loadSubScript(devUrl, devScope, "UTF-8");
		}
	}
	catch (e) {
		// Expected in release builds, where the dev channel file doesn't exist;
		// in dev builds this records a diagnostic file instead of hiding it.
		const message = (e && (e.message || e.toString())) || String(e);
		if (!/FILE_NOT_FOUND/i.test(message)) {
			try {
				Zotero.File.putContentsAsync(
					PathUtils.join(PathUtils.tempDir, "annotate-pdf-devhook-error.txt"), message
				).catch(() => {});
			}
			catch (e2) {
				// Ignore
			}
		}
	}
}

function onMainWindowLoad({ window }) {
	setupWindow(window);
}

function onMainWindowUnload({ window }) {
	teardownWindow(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
	if (reason === APP_SHUTDOWN) {
		return;
	}

	if (typeof Zotero === "undefined") {
		Zotero = Components.classes["@zotero.org/Zotero;1"]
			.getService(Components.interfaces.nsISupports)
			.wrappedJSObject;
	}

	if (annotatePdfDevCleanup) {
		try {
			annotatePdfDevCleanup();
		}
		catch (e) {
			// Ignore
		}
		annotatePdfDevCleanup = null;
	}

	try {
		if (Zotero.AnnotatePDF === AnnotatePDF) {
			delete Zotero.AnnotatePDF;
		}
	}
	catch (e) {
		Zotero.logError(e);
	}

	if (annotatePdfReaderHandler) {
		try {
			Zotero.Reader.unregisterEventListener("renderToolbar", annotatePdfReaderHandler);
		}
		catch (e) {
			Zotero.logError(e);
		}
		annotatePdfReaderHandler = null;
	}

	try {
		Zotero.MenuManager.unregisterMenu(MENU_ID);
	}
	catch (e) {
		Zotero.logError(e);
	}

	teardownReaderButtons();

	for (let win of Zotero.getMainWindows()) {
		teardownWindow(win);
	}

	if (chromeHandle) {
		chromeHandle.destruct();
		chromeHandle = null;
	}
}

function install(data, reason) {}

function uninstall(data, reason) {}

/* ------------------------------------------------------------------ */
/* Window / localization plumbing                                     */
/* ------------------------------------------------------------------ */

function setupWindow(win) {
	try {
		if (!win || !win.document || win.closed) {
			return;
		}
		win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
		addItemMenuListener(win);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function teardownWindow(win) {
	try {
		if (!win || !win.document || win.closed) {
			return;
		}
		if (win.__annotatePdfMenuHandler) {
			const menu = win.document.getElementById(ITEM_MENU_ID);
			if (menu) {
				menu.removeEventListener("popupshowing", win.__annotatePdfMenuHandler);
			}
			delete win.__annotatePdfMenuHandler;
		}
		win.document.querySelector(`link[href="${FTL_FILE}"]`)?.remove();
	}
	catch (e) {
		// Ignore
	}
}

/**
 * Watch the library item context menu ourselves. Zotero registers the
 * MenuManager `onShowing` hook as a `popupshowing` listener, so it only runs
 * from the *second* time the menu is opened; our own listener runs immediately
 * (the menu items exist by the time the popup is shown) and keeps the entry's
 * visibility and icon in sync.
 */
function addItemMenuListener(win) {
	try {
		const menu = win.document.getElementById(ITEM_MENU_ID);
		if (!menu || win.__annotatePdfMenuHandler) {
			return;
		}
		const handler = () => {
			try {
				applyItemMenuState(win);
			}
			catch (e) {
				Zotero.logError(e);
			}
		};
		menu.addEventListener("popupshowing", handler);
		win.__annotatePdfMenuHandler = handler;
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function findMenuItem(win) {
	try {
		const menu = win.document.getElementById(ITEM_MENU_ID);
		if (!menu) {
			return null;
		}
		return menu.querySelector(`.${ITEM_MARKER_CLASS}`)
			|| menu.querySelector('[data-l10n-id="annotate-pdf-menu"]');
	}
	catch (e) {
		return null;
	}
}

/**
 * Sync the menu entry: hide it unless the selection has PDF attachments, and
 * mark it with either a text glyph or the PNG icon.
 */
function applyItemMenuState(win) {
	const item = findMenuItem(win);
	if (!item) {
		return;
	}
	item.classList.add(ITEM_MARKER_CLASS);
	item.hidden = expandToPDFAttachments(selectedItems()).length === 0;

	const image = item.querySelector("image, .menu-icon");
	if (getMenuIconStyle() === "glyph") {
		// A text glyph always renders, unlike Zotero's menu icon CSS variables on
		// some setups; drop the icon box so only the glyph shows.
		item.style.setProperty("--custom-menu-icon-light", "initial");
		item.style.setProperty("--custom-menu-icon-dark", "initial");
		item.classList.remove("menuitem-iconic", "menu-iconic");
		if (image) {
			image.removeAttribute("src");
		}
		getString("annotate-pdf-menu")
			.then((label) => {
				item.removeAttribute("data-l10n-id");
				item.setAttribute("label", MENU_GLYPH + " " + label);
			})
			.catch(() => {});
	}
	else {
		if (image && !image.getAttribute("src")) {
			let dark = false;
			try {
				dark = Services.prefs.getIntPref("browser.theme.toolbar-theme", 2) === 0;
			}
			catch (e) {
				// Ignore: default to the light variant
			}
			image.setAttribute(
				"src",
				`chrome://${ADDON_REF}/content/icons/${dark ? "icon-menu-dark" : "icon-menu"}.png`
			);
		}
		getString("annotate-pdf-menu")
			.then((label) => {
				item.setAttribute("label", label);
				item.setAttribute("data-l10n-id", "annotate-pdf-menu");
			})
			.catch(() => {});
	}
}

function teardownReaderButtons() {
	try {
		for (const reader of (Zotero.Reader._readers || [])) {
			try {
				reader._iframeWindow?.document?.getElementById(READER_BUTTON_ID)?.remove();
			}
			catch (e) {
				// Ignore
			}
		}
	}
	catch (e) {
		// Ignore
	}
}

function isZhLocale() {
	try {
		return String(Zotero.locale || "").toLowerCase().startsWith("zh");
	}
	catch (e) {
		return false;
	}
}

/**
 * Localized string with a built-in fallback, so the plugin still reads
 * sensibly if the FTL file isn't loaded yet.
 *
 * @param {String} id - FTL id
 * @param {Object} [args] - template arguments
 * @return {Promise<String>}
 */
async function getString(id, args) {
	try {
		const win = Zotero.getMainWindow();
		const l10n = win?.document?.l10n;
		if (l10n?.formatValue) {
			const value = await l10n.formatValue(id, args);
			if (value) {
				return value;
			}
		}
	}
	catch (e) {
		// Fall through to the built-in strings
	}
	return fallbackFor(id, args);
}

function fallbackFor(id, args) {
	const entry = FALLBACK_STRINGS[id] || [];
	let text = (isZhLocale() ? entry[1] : entry[0]) || id;
	if (args) {
		text = text.replace(/\{\s*\$(\w+)\s*\}/g, (m, key) => (key in args ? String(args[key]) : m));
	}
	return text;
}

/* ------------------------------------------------------------------ */
/* Preferences                                                        */
/* ------------------------------------------------------------------ */

function registerPrefDefaults() {
	try {
		const defaults = Services.prefs.getDefaultBranch(PREF_PREFIX);
		defaults.setStringPref("defaultAction", "copy");
		defaults.setStringPref("outputDir", "");
		// Ask before writing into the original file
		defaults.setBoolPref("confirmOverwrite", true);
		// Keep a `<name>.bak.pdf` next to the file before overwriting it
		defaults.setBoolPref("backupOnOverwrite", true);
		// Import annotations made in other apps into Zotero instead of refusing
		defaults.setBoolPref("adoptForeignAnnotations", true);
		// Menu marker: "glyph" (a text glyph before the label, always renders) or
		// "image" (a PNG drawn by Zotero's menu icon mechanism)
		defaults.setStringPref("menuIconStyle", "glyph");
		// Suppress modal error alerts (for scripted/automated use)
		defaults.setBoolPref("silentErrors", false);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function isSilentErrors() {
	try {
		return Services.prefs.getBoolPref(PREF_PREFIX + "silentErrors", false);
	}
	catch (e) {
		return false;
	}
}

function isConfirmOverwrite() {
	try {
		return Services.prefs.getBoolPref(PREF_PREFIX + "confirmOverwrite", true);
	}
	catch (e) {
		return true;
	}
}

function isBackupOnOverwrite() {
	try {
		return Services.prefs.getBoolPref(PREF_PREFIX + "backupOnOverwrite", true);
	}
	catch (e) {
		return true;
	}
}

/**
 * Whether annotations found in the file that were not written by this item
 * (e.g. made in another PDF app) should be imported into Zotero on write.
 */
function isAdoptForeignAnnotations() {
	try {
		return Services.prefs.getBoolPref(PREF_PREFIX + "adoptForeignAnnotations", true);
	}
	catch (e) {
		return true;
	}
}

/**
 * How the item menu entry is marked: "glyph" draws a text glyph in front of the
 * label (always renders), "image" uses Zotero's menu icon mechanism.
 */
function getMenuIconStyle() {
	try {
		const value = Services.prefs.getStringPref(PREF_PREFIX + "menuIconStyle", "glyph");
		return value === "image" ? "image" : "glyph";
	}
	catch (e) {
		return "glyph";
	}
}

function getDefaultAction() {
	try {
		const value = Services.prefs.getStringPref(PREF_PREFIX + "defaultAction", "copy");
		return ["copy", "overwrite", "saveas", "ask"].includes(value) ? value : "copy";
	}
	catch (e) {
		return "copy";
	}
}

function getOutputDir() {
	try {
		return Services.prefs.getStringPref(PREF_PREFIX + "outputDir", "").trim();
	}
	catch (e) {
		return "";
	}
}

/* ------------------------------------------------------------------ */
/* Item helpers                                                       */
/* ------------------------------------------------------------------ */

function isPDFAttachment(item) {
	try {
		return !!(item && !item.deleted && item.isPDFAttachment && item.isPDFAttachment());
	}
	catch (e) {
		return false;
	}
}

function selectedItems() {
	try {
		let pane = typeof Zotero.getActiveZoteroPane === "function" ? Zotero.getActiveZoteroPane() : null;
		if (!pane) {
			pane = Zotero.getMainWindow()?.ZoteroPane;
		}
		return pane?.getSelectedItems ? pane.getSelectedItems() : [];
	}
	catch (e) {
		Zotero.logError(e);
		return [];
	}
}

/**
 * Expand a selection to the PDF attachments it refers to: PDF attachments
 * themselves, plus the PDF children of selected regular items (a paper in the
 * library with a PDF attached).
 *
 * @param {Zotero.Item[]} items
 * @return {Zotero.Item[]}
 */
function expandToPDFAttachments(items) {
	const result = [];
	const seen = new Set();
	for (const item of items || []) {
		if (!item || item.deleted) {
			continue;
		}
		if (isPDFAttachment(item)) {
			if (!seen.has(item.id)) {
				seen.add(item.id);
				result.push(item);
			}
			continue;
		}
		let childIDs = [];
		try {
			childIDs = item.getAttachments ? item.getAttachments() : [];
		}
		catch (e) {
			childIDs = [];
		}
		for (const id of childIDs) {
			const child = Zotero.Items.get(id);
			if (isPDFAttachment(child) && !seen.has(child.id)) {
				seen.add(child.id);
				result.push(child);
			}
		}
	}
	return result;
}

function selectedPDFAttachments() {
	return expandToPDFAttachments(selectedItems());
}

function annotationCount(item) {
	try {
		return item.getAnnotations().filter(a => !a.deleted).length;
	}
	catch (e) {
		return 0;
	}
}

function itemTitle(item) {
	try {
		const title = item.getField && item.getField("title");
		if (title) {
			return title;
		}
	}
	catch (e) {
		// Ignore
	}
	try {
		const path = item.getFilePath && item.getFilePath();
		if (path) {
			return PathUtils.filename(path);
		}
	}
	catch (e) {
		// Ignore
	}
	return "PDF";
}

/**
 * Reuse the password of an already-open reader tab for encrypted PDFs.
 */
function getPasswordForItem(itemID) {
	try {
		const readers = Zotero.Reader._readers || [];
		const reader = readers.find(r => r.itemID === itemID || r._item?.id === itemID);
		return reader?._password || reader?.password || "";
	}
	catch (e) {
		return "";
	}
}

/* ------------------------------------------------------------------ */
/* Menu (library item context menu)                                   */
/* ------------------------------------------------------------------ */

function registerMenus() {
	try {
		return Zotero.MenuManager.registerMenu({
			menuID: MENU_ID,
			pluginID: PLUGIN_ID,
			target: "main/library/item",
			menus: [
				{
					menuType: "menuitem",
					l10nID: "annotate-pdf-menu",
					// PNGs, not SVG: Zotero's menu icon area does not resolve
					// `context-fill`, so an SVG renders as an empty box.
					icon: `chrome://${ADDON_REF}/content/icons/icon-menu.png`,
					darkIcon: `chrome://${ADDON_REF}/content/icons/icon-menu-dark.png`,
					// ZoteroPane does not pass an event to updateMenuPopup(), so
					// this hook is registered as a popupshowing listener and only
					// runs from the second time the menu is opened.
					onShowing: (event, context) => onMenuShowing(context),
					onCommand: () => runAction(null),
				},
			],
		});
	}
	catch (e) {
		Zotero.logError(e);
		return false;
	}
}

function onMenuShowing(context) {
	try {
		// ZoteroPane passes the selected items in the menu context; fall back to
		// the live selection for other callers.
		const items = (context && Array.isArray(context.items)) ? context.items : selectedItems();
		context.setVisible(expandToPDFAttachments(items).length > 0);
		// Keep the icon/label in sync as well (see applyItemMenuState)
		const menuElem = context && context.menuElem;
		if (menuElem && menuElem.ownerGlobal) {
			applyItemMenuState(menuElem.ownerGlobal);
		}
	}
	catch (e) {
		Zotero.logError(e);
	}
}

/* ------------------------------------------------------------------ */
/* Reader toolbar button                                              */
/* ------------------------------------------------------------------ */

function registerReaderToolbar() {
	annotatePdfReaderHandler = (event) => {
		try {
			const { reader, doc, append } = event || {};
			if (!reader || !doc || typeof append !== "function") {
				return;
			}
			if (doc.getElementById(READER_BUTTON_ID)) {
				return;
			}
			const itemID = reader.itemID || reader._item?.id;
			const item = itemID ? Zotero.Items.get(itemID) : null;
			if (!isPDFAttachment(item)) {
				return;
			}

			const button = doc.createElement("button");
			button.id = READER_BUTTON_ID;
			button.className = "toolbar-button";
			button.setAttribute("tabindex", "-1");

			const icon = doc.createElement("div");
			icon.className = "toolbar-button-icon";
			icon.style.setProperty("background-color", "currentColor");
			icon.style.setProperty("mask-image", `url(chrome://${ADDON_REF}/content/icons/toolbar.svg)`);
			icon.style.setProperty("mask-size", "contain");
			icon.style.setProperty("mask-repeat", "no-repeat");
			icon.style.setProperty("mask-position", "center");
			icon.style.setProperty("width", "100%");
			icon.style.setProperty("height", "100%");
			button.appendChild(icon);

			button.addEventListener("click", (e) => {
				e.preventDefault();
				button.disabled = true;
				runActionForItem(item).finally(() => {
					try {
						button.disabled = false;
					}
					catch (err) {
						// Ignore
					}
				});
			});

			getString("annotate-pdf-toolbar-tip")
				.then((tip) => {
					button.setAttribute("title", tip);
					button.setAttribute("aria-label", tip);
				})
				.catch(() => {});

			append(button);
		}
		catch (e) {
			Zotero.logError(e);
		}
	};

	try {
		Zotero.Reader.registerEventListener("renderToolbar", annotatePdfReaderHandler, PLUGIN_ID);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

/* ------------------------------------------------------------------ */
/* Writing annotations into PDFs                                      */
/* ------------------------------------------------------------------ */

/**
 * @param {String} [mode] - "copy" | "overwrite" | "saveas" | "ask"; when omitted
 *   (or falsy) the default-action preference decides
 * @param {Zotero.Item[]} [items] - defaults to the current selection
 * @return {Promise<Object[]>} per-item results
 */
async function runAction(mode, items) {
	const win = Zotero.getMainWindow();
	try {
		const explicit = Array.isArray(items);
		items = expandToPDFAttachments(items || selectedItems());
		if (!items.length) {
			if (explicit) {
				Services.prompt.alert(
					win,
					await getString("annotate-pdf-alert-title"),
					await getString("annotate-pdf-selection-empty")
				);
			}
			return [];
		}
		if (!mode) {
			mode = getDefaultAction();
		}
		if (mode === "ask") {
			mode = await askForMode();
			if (!mode) {
				return [];
			}
		}
		if (mode === "overwrite" && !(await confirmOverwrite(items.length))) {
			return [];
		}
		const results = [];
		for (const item of items) {
			results.push(Object.assign({ item }, await writeForAttachment(item, mode)));
		}
		await reportResults(results);
		return results;
	}
	catch (e) {
		Zotero.logError(e);
		const message = e.message || String(e);
		if (!isSilentErrors()) {
			try {
				Services.prompt.alert(
					win,
					await getString("annotate-pdf-alert-title"),
					await getString("annotate-pdf-error-generic", { message })
				);
			}
			catch (e2) {
				// Ignore
			}
		}
		return [];
	}
}

/**
 * Entry point for the reader toolbar button: uses the default action.
 */
async function runActionForItem(item) {
	return runAction(null, [item]);
}

/**
 * @param {Zotero.Item} attachment - PDF attachment item
 * @param {String} mode - "copy" | "overwrite" | "saveas"
 * @return {Promise<Object>} { status: ok|no-annotations|no-file|cancelled|error, ... }
 */
async function writeForAttachment(attachment, mode) {
	if (!isPDFAttachment(attachment)) {
		return { status: "error", message: "Not a PDF attachment" };
	}
	if (!annotationCount(attachment)) {
		return { status: "no-annotations" };
	}
	let srcPath = null;
	try {
		srcPath = await attachment.getFilePathAsync();
	}
	catch (e) {
		Zotero.logError(e);
	}
	if (!srcPath) {
		return { status: "no-file" };
	}

	const password = getPasswordForItem(attachment.id);
	try {
		if (mode === "overwrite") {
			return await writeOverwrite(attachment, srcPath, password);
		}
		if (mode === "saveas") {
			return await writeSaveAs(attachment, srcPath, password);
		}
		return await writeCopy(attachment, srcPath, password);
	}
	catch (e) {
		Zotero.logError(e);
		return { status: "error", message: await describeError(e) };
	}
}

/**
 * Make sure the PDF worker exists. `_query()` requires `this._worker`, but the
 * worker is only created from `_init()`, which the public methods reach through
 * `_enqueue()`/`_processQueue()` — calling `_query()` directly would otherwise
 * fail with "this._worker is null".
 *
 * @param {Number} [itemID] - for the public-API fallback
 */
async function ensurePDFWorker(itemID) {
	if (typeof Zotero.PDFWorker._init === "function") {
		Zotero.PDFWorker._init();
		return;
	}
	// Fallback: any public worker call initializes it as a side effect
	if (typeof Zotero.PDFWorker.hasAnnotations === "function" && itemID) {
		await Zotero.PDFWorker.hasAnnotations(itemID);
	}
}

/**
 * Read the annotations currently embedded in a PDF file, using Zotero's PDF
 * worker (the same action behind "Import Annotations…", but without touching
 * the database). The worker's `_query` is internal API; callers must handle
 * failures by *not* writing rather than falling back to appending.
 *
 * @param {String} srcPath
 * @param {String} password
 * @param {Number} [itemID]
 * @return {Promise<Object[]>} parsed annotations ({ id?, type, position, comment, ... })
 */
async function readEmbeddedAnnotations(srcPath, password, itemID) {
	if (typeof Zotero.PDFWorker._query !== "function") {
		throw new Error("Zotero.PDFWorker._query is not available in this Zotero version");
	}
	await ensurePDFWorker(itemID);
	const buf = new Uint8Array(await IOUtils.read(srcPath)).buffer;
	const result = await Zotero.PDFWorker._query(
		"pdf.importAnnotations",
		{ buf, existingAnnotations: [], password: password || "", transfer: false },
		[buf]
	);
	return (result && result.imported) || [];
}

/**
 * Remove the annotations stored in a PDF file (`transfer`), without importing
 * them into the database.
 *
 * @param {String} srcPath
 * @param {String} password
 * @param {Number} [itemID]
 * @return {Promise<{stripped: Boolean, total: Number}>}
 */
async function removeEmbeddedAnnotations(srcPath, password, itemID) {
	if (typeof Zotero.PDFWorker._query !== "function") {
		throw new Error("Zotero.PDFWorker._query is not available in this Zotero version");
	}
	await ensurePDFWorker(itemID);
	const buf = new Uint8Array(await IOUtils.read(srcPath)).buffer;
	const result = await Zotero.PDFWorker._query(
		"pdf.importAnnotations",
		{ buf, existingAnnotations: [], password: password || "", transfer: true },
		[buf]
	);
	if (!result || !result.buf) {
		return { stripped: false, total: 0 };
	}
	await IOUtils.write(srcPath, new Uint8Array(result.buf));
	return { stripped: true, total: (result.imported || []).length };
}

/**
 * Zotero's annotation writer *appends* to a page's `/Annots` array, so writing
 * the same annotations into the same file twice would stack duplicates (a
 * translucent highlight gets darker every time). Zotero itself never hits this
 * because it always exports into a new file.
 *
 * Before an in-place write we therefore remove what is already embedded, but
 * only when we are sure it is our own previous output: every annotation in the
 * file must carry a Zotero key that belongs to this attachment's database
 * annotations. Anything else (a foreign highlight, or an annotation from
 * another library) makes us refuse rather than risk deleting data.
 *
 * @param {Zotero.Item} attachment
 * @param {String} srcPath
 * @param {String} password
 * @return {Promise<{stripped: Boolean, embedded: Number}>}
 */
async function stripPreviousEmbeddedAnnotations(attachment, srcPath, password) {
	const embedded = await readEmbeddedAnnotations(srcPath, password, attachment.id);
	if (!embedded.length) {
		return { stripped: false, embedded: 0 };
	}
	const ourKeys = new Set(
		attachment.getAnnotations()
			.filter(a => !a.annotationIsExternal)
			.map(a => a.key)
	);
	const ours = embedded.filter(a => a.id && ourKeys.has(a.id));
	const foreign = embedded.filter(a => !a.id || !ourKeys.has(a.id));
	if (!ours.length || foreign.length) {
		throw new Error(await getString("annotate-pdf-error-foreign-annotations", {
			count: foreign.length || embedded.length,
		}));
	}
	const result = await removeEmbeddedAnnotations(srcPath, password, attachment.id);
	return { stripped: result.stripped, embedded: embedded.length };
}

/**
 * Normalize an annotation for comparison: accepts an annotation item
 * (`annotationType`/`annotationPosition`/`annotationComment`) or a parsed
 * annotation from the PDF worker (`type`/`position`/`comment`).
 */
function annotationShape(input) {
	let type;
	let position;
	let comment;
	if (input && typeof input.annotationType === "string") {
		type = input.annotationType;
		try {
			position = JSON.parse(input.annotationPosition);
		}
		catch (e) {
			position = null;
		}
		comment = input.annotationComment || "";
	}
	else if (input) {
		type = input.type;
		position = input.position;
		comment = input.comment || "";
	}
	if (!position) {
		return null;
	}
	return {
		type,
		pageIndex: position.pageIndex,
		rects: (position.rects || [])
			.map(r => r.map(n => Math.round(n * 10) / 10).join(","))
			.sort()
			.join(";"),
		comment: String(comment).trim(),
	};
}

function sameAnnotation(a, b) {
	const sa = annotationShape(a);
	const sb = annotationShape(b);
	if (!sa || !sb) {
		return false;
	}
	return sa.type === sb.type
		&& sa.pageIndex === sb.pageIndex
		&& sa.rects === sb.rects
		&& sa.comment === sb.comment;
}

/**
 * Take over annotations that are in the file but were not written by this item
 * (e.g. made with another PDF app) by running Zotero's own "Import Annotations…"
 * round trip: they become normal (editable) items in the database and the file
 * is stripped of them. Copies created for our own annotations are dropped again
 * so nothing is duplicated, and the read-only ("external") items Zotero created
 * when the externally-edited file was opened are superseded by that same flow.
 *
 * @return {Promise<{adopted: Number, external: Number}>}
 */
async function adoptForeignAnnotations(attachment, embedded, password) {
	const ourKeys = new Set(
		attachment.getAnnotations()
			.filter(a => !a.annotationIsExternal)
			.map(a => a.key)
	);
	const foreign = embedded.filter(a => !a.id || !ourKeys.has(a.id));
	if (!foreign.length) {
		return { adopted: 0, external: 0 };
	}
	if (!isAdoptForeignAnnotations()) {
		throw new Error(await getString("annotate-pdf-error-foreign-annotations", {
			count: foreign.length,
		}));
	}
	if (typeof Zotero.PDFWorker.import !== "function") {
		throw new Error(await getString("annotate-pdf-error-foreign-annotations", {
			count: foreign.length,
		}));
	}
	const beforeItems = attachment.getAnnotations();
	const beforeKeys = new Set(beforeItems.map(a => a.key));
	const ourItems = beforeItems.filter(a => !a.annotationIsExternal);
	const externalCount = beforeItems.length - ourItems.length;
	// Zotero's round trip: imports everything as editable annotations and
	// removes the transferable annotations from the file
	await Zotero.PDFWorker.import(attachment.id, true, password || "", true);
	const afterItems = attachment.getAnnotations();
	const fresh = afterItems.filter(a => !beforeKeys.has(a.key));
	const duplicates = fresh.filter(f => ourItems.some(o => sameAnnotation(o, f)));
	if (duplicates.length) {
		await Zotero.Items.erase(duplicates.map(a => a.id));
	}
	return { adopted: foreign.length, external: externalCount };
}

/**
 * Move read-only ("external") annotation items that duplicate a normal
 * annotation of the same attachment to the trash. These are the leftovers
 * Zotero creates when a file that carries annotations is opened (each time the
 * file is written again, another set of locked copies appears) — after the file
 * has been cleaned up they are pure noise and cannot be edited in the reader.
 *
 * @return {Promise<Number>} number of items trashed
 */
async function trashDuplicateExternalAnnotations(attachment) {
	const items = attachment.getAnnotations();
	const externals = items.filter(a => a.annotationIsExternal);
	if (!externals.length) {
		return 0;
	}
	const normals = items.filter(a => !a.annotationIsExternal);
	const duplicates = externals.filter(e => normals.some(n => sameAnnotation(n, e)));
	for (const item of duplicates) {
		item.deleted = true;
		await item.saveTx({ skipAll: true });
	}
	return duplicates.length;
}

/**
 * Write the annotations into the original file (optionally keeping a backup).
 */
async function writeOverwrite(attachment, srcPath, password) {
	// 1) Backup first, so it holds the file as it was before any modification
	let backupPath = null;
	if (isBackupOnOverwrite()) {
		backupPath = backupPathFor(srcPath);
		await IOUtils.remove(backupPath, { ignoreAbsent: true });
		await IOUtils.copy(srcPath, backupPath);
	}
	// 2) Take over annotations that came from other apps (they would otherwise be
	//    kept as read-only copies, or block the write)
	let adoption = { adopted: 0, external: 0 };
	const embedded = await readEmbeddedAnnotations(srcPath, password, attachment.id);
	if (embedded.length) {
		adoption = await adoptForeignAnnotations(attachment, embedded, password);
	}
	// 3) Drop annotations from a previous write so they don't stack up
	const strip = await stripPreviousEmbeddedAnnotations(attachment, srcPath, password);
	// 4) Write the current database annotations
	const count = await exportAnnotations(attachment.id, srcPath, password);
	// 5) Drop read-only duplicates left over from earlier writes/imports
	const trashedExternals = await trashDuplicateExternalAnnotations(attachment);
	// Mirror what Zotero's own in-place page operations (deletePages /
	// rotatePages) do: record the new file mtime as "already processed", so the
	// reader doesn't re-import the annotations we just embedded as external
	// duplicates.
	try {
		const mtime = Math.floor((await attachment.attachmentModificationTime) / 1000);
		attachment.attachmentLastProcessedModificationTime = mtime;
		await attachment.saveTx({ skipAll: true });
	}
	catch (e) {
		Zotero.logError(e);
	}
	return {
		status: "ok",
		mode: "overwrite",
		path: srcPath,
		backupPath,
		count,
		strippedEmbedded: strip.stripped ? strip.embedded : 0,
		adoptedEmbedded: adoption.adopted,
		adoptedExternalItems: adoption.external,
		trashedExternalItems: trashedExternals,
	};
}

/**
 * Save the annotated PDF through a file dialog.
 */
async function writeSaveAs(attachment, srcPath, password) {
	const destPath = await pickSavePath(srcPath);
	if (!destPath) {
		return { status: "cancelled" };
	}
	const count = await exportAnnotations(attachment.id, destPath, password);
	return { status: "ok", mode: "saveas", path: destPath, count };
}

/**
 * Save an "annotated" copy:
 *  - `outputDir` preference set  -> write there
 *  - linked file                 -> write next to the original
 *  - stored file                 -> import the copy into Zotero as a new
 *                                   attachment of the same item
 */
async function writeCopy(attachment, srcPath, password) {
	const baseName = annotatedBaseName(srcPath);
	const outputDir = getOutputDir();

	if (outputDir) {
		try {
			await Zotero.File.createDirectoryIfMissingAsync(outputDir);
		}
		catch (e) {
			// Ignore; the write below will surface a real problem
		}
		const destPath = await uniqueFilePath(outputDir, baseName + ".pdf");
		const count = await exportAnnotations(attachment.id, destPath, password);
		return { status: "ok", mode: "copy", path: destPath, count };
	}

	const isLinked = attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE;
	if (isLinked) {
		const destPath = await uniqueFilePath(PathUtils.parent(srcPath), baseName + ".pdf");
		const count = await exportAnnotations(attachment.id, destPath, password);
		return { status: "ok", mode: "copy", path: destPath, count };
	}

	return await writeCopyAsAttachment(attachment, baseName, password);
}

async function writeCopyAsAttachment(attachment, baseName, password) {
	const tmpDir = PathUtils.join(Zotero.getTempDirectory().path, COPY_TMP_SUBDIR);
	try {
		await Zotero.File.createDirectoryIfMissingAsync(tmpDir);
	}
	catch (e) {
		Zotero.logError(e);
	}
	const tmpPath = PathUtils.join(tmpDir, baseName + ".pdf");
	await IOUtils.remove(tmpPath, { ignoreAbsent: true });

	let newItem;
	try {
		const count = await exportAnnotations(attachment.id, tmpPath, password);
		const options = {
			file: Zotero.File.pathToFile(tmpPath),
			libraryID: attachment.libraryID,
			fileBaseName: baseName,
			title: baseName,
		};
		if (attachment.parentID) {
			options.parentItemID = attachment.parentID;
		}
		else {
			options.collections = attachment.getCollections();
		}
		newItem = await Zotero.Attachments.importFromFile(options);
		return {
			status: "ok",
			mode: "copy",
			path: await newItem.getFilePathAsync(),
			itemID: newItem.id,
			count,
		};
	}
	finally {
		await IOUtils.remove(tmpPath, { ignoreAbsent: true }).catch(() => {});
	}
}

async function exportAnnotations(itemID, destPath, password) {
	return await Zotero.PDFWorker.export(itemID, destPath, true, password || "", false);
}

async function describeError(e) {
	const message = e?.message || String(e) || "unknown error";
	if (/password|encrypt/i.test(message)) {
		return await getString("annotate-pdf-error-encrypted");
	}
	return message;
}

/* ------------------------------------------------------------------ */
/* Paths and dialogs                                                  */
/* ------------------------------------------------------------------ */

function annotatedBaseName(srcPath) {
	const fileName = PathUtils.filename(srcPath).replace(/\.pdf$/i, "");
	return fileName + (isZhLocale() ? SUFFIX_ZH : SUFFIX_EN);
}

function backupPathFor(srcPath) {
	const dir = PathUtils.parent(srcPath);
	const fileName = PathUtils.filename(srcPath).replace(/\.pdf$/i, "");
	return PathUtils.join(dir, fileName + BACKUP_SUFFIX);
}

async function uniqueFilePath(dir, fileName) {
	let candidate = PathUtils.join(dir, fileName);
	if (!(await IOUtils.exists(candidate))) {
		return candidate;
	}
	const base = fileName.replace(/\.pdf$/i, "");
	for (let i = 2; i < 1000; i++) {
		candidate = PathUtils.join(dir, `${base} (${i}).pdf`);
		if (!(await IOUtils.exists(candidate))) {
			return candidate;
		}
	}
	return candidate;
}

async function pickSavePath(srcPath) {
	const win = Zotero.getMainWindow();
	const title = await getString("annotate-pdf-menu-saveas");
	const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
	fp.init(win, title, Ci.nsIFilePicker.modeSave);
	fp.appendFilter("PDF", "*.pdf");
	fp.defaultExtension = "pdf";
	fp.defaultString = annotatedBaseName(srcPath) + ".pdf";
	try {
		fp.displayDirectory = Zotero.File.pathToFile(PathUtils.parent(srcPath));
	}
	catch (e) {
		// Ignore; the dialog just opens in its default location
	}

	let rv;
	try {
		rv = await fp.open();
	}
	catch (e) {
		try {
			rv = await new Promise(resolve => fp.show(resolve));
		}
		catch (e2) {
			Zotero.logError(e2);
			return null;
		}
	}
	if (rv !== Ci.nsIFilePicker.returnOK && rv !== Ci.nsIFilePicker.returnReplace) {
		return null;
	}
	return fp.file.path;
}

async function confirmOverwrite(count) {
	if (!isConfirmOverwrite()) {
		return true;
	}
	const win = Zotero.getMainWindow();
	const textID = isBackupOnOverwrite()
		? "annotate-pdf-confirm-overwrite-text"
		: "annotate-pdf-confirm-overwrite-text-nobackup";
	return Services.prompt.confirm(
		win,
		await getString("annotate-pdf-confirm-overwrite-title"),
		await getString(textID, { count })
	);
}

async function askForMode() {
	const win = Zotero.getMainWindow();
	const title = await getString("annotate-pdf-ask-title");
	const text = await getString("annotate-pdf-ask-text");
	const copyLabel = await getString("annotate-pdf-ask-copy");
	const overwriteLabel = await getString("annotate-pdf-ask-overwrite");
	const ps = Services.prompt;
	const flags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING
		+ ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING
		+ ps.BUTTON_POS_2 * ps.BUTTON_TITLE_CANCEL;
	const rv = ps.confirmEx(win, title, text, flags, copyLabel, overwriteLabel, null, null, {});
	return rv === 0 ? "copy" : rv === 1 ? "overwrite" : null;
}

/* ------------------------------------------------------------------ */
/* Reporting                                                          */
/* ------------------------------------------------------------------ */

async function reportResults(results) {
	const win = Zotero.getMainWindow();
	const lines = [];
	const errors = [];

	for (const r of results) {
		if (r.status === "ok") {
			const label = await getString(
				r.mode === "overwrite" ? "annotate-pdf-done-overwrite" : "annotate-pdf-done-copy"
			);
			lines.push(`${label} ${r.path}`);
			if (r.adoptedEmbedded > 0) {
				lines.push(await getString("annotate-pdf-done-adopted", { count: r.adoptedEmbedded }));
			}
			if (r.strippedEmbedded > 0) {
				lines.push(await getString("annotate-pdf-done-cleaned", { count: r.strippedEmbedded }));
			}
			if (r.trashedExternalItems > 0) {
				lines.push(await getString("annotate-pdf-done-trashed", { count: r.trashedExternalItems }));
			}
			if (r.mode === "overwrite" && r.backupPath && results.length === 1) {
				lines.push(await getString("annotate-pdf-done-backup", { path: r.backupPath }));
			}
		}
		else if (r.status === "no-annotations") {
			lines.push(await getString("annotate-pdf-no-annotations", { title: itemTitle(r.item) }));
		}
		else if (r.status === "no-file") {
			lines.push(await getString("annotate-pdf-no-file", { title: itemTitle(r.item) }));
		}
		else if (r.status === "error") {
			errors.push(`${itemTitle(r.item)}: ${r.message}`);
		}
	}

	if (lines.length) {
		try {
			const pw = new Zotero.ProgressWindow();
			pw.changeHeadline(await getString("annotate-pdf-done-headline"));
			for (const line of lines) {
				pw.addDescription(line);
			}
			pw.show();
			if (typeof pw.startCloseTimer === "function") {
				pw.startCloseTimer(8000);
			}
			else {
				setTimeout(() => {
					try {
						pw.close();
					}
					catch (e) {
						// Ignore
					}
				}, 8000);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
	}

	if (errors.length) {
		const message = errors.join("\n");
		if (isSilentErrors()) {
			Zotero.logError(new Error("annotate-pdf: " + message));
		}
		else {
			try {
				Services.prompt.alert(win, await getString("annotate-pdf-error-title"), message);
			}
			catch (e) {
				Zotero.logError(e);
			}
		}
	}
}
