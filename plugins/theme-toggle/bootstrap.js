/*
 * Theme Toggle for Zotero
 *
 * Adds a toolbar button, a keyboard shortcut (Ctrl/Cmd+Shift+D) and a Tools
 * menu item that switch Zotero's native color scheme between light and dark.
 *
 * The native setting under Settings -> General -> Color Scheme is backed by
 * the Gecko preference `browser.theme.toolbar-theme`:
 *   0 = Dark, 1 = Light, 2 = Follow system
 * Setting it triggers Gecko's theme refresh, so the switch applies instantly.
 */

"use strict";

var chromeHandle;
var prefObserver;

const ADDON_REF = "theme-toggle";
const PREF = "browser.theme.toolbar-theme";
const BUTTON_ID = "zotero-tb-theme-toggle";
const KEY_ID = "key_zotero-theme-toggle";
const MENU_ID = "theme-toggle-tools-menu";
const FTL_FILE = "theme-toggle.ftl";

async function startup({ id, version, resourceURI, rootURI }, reason) {
	await Zotero.initializationPromise;

	if (!rootURI) {
		rootURI = resourceURI.spec;
	}

	const aomStartup = Components.classes["@mozilla.org/addons/addon-manager-startup;1"]
		.getService(Components.interfaces.amIAddonManagerStartup);
	const manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", ADDON_REF, rootURI + "chrome/content/"]
	]);

	try {
		await Zotero.uiReadyPromise;
	}
	catch (e) {
		// Ignore
	}

	try {
		Zotero.MenuManager.registerMenu({
			menuID: MENU_ID,
			pluginID: id,
			target: "main/menubar/tools",
			menus: [
				{
					menuType: "menuitem",
					l10nID: "theme-toggle-menu-label",
					icon: `chrome://${ADDON_REF}/content/icons/logo.svg`,
					darkIcon: `chrome://${ADDON_REF}/content/icons/logo.svg`,
					onCommand: (event, context) => {
						let win = context?.menuElem?.ownerGlobal
							|| event?.target?.ownerGlobal
							|| Zotero.getMainWindow();
						toggleTheme(win);
					}
				}
			]
		});
	}
	catch (e) {
		Zotero.logError(e);
	}

	prefObserver = {
		observe(subject, topic, data) {
			if (topic !== "nsPref:changed" || data !== PREF) {
				return;
			}
			for (let win of Zotero.getMainWindows()) {
				updateButton(win);
			}
		}
	};
	Services.prefs.addObserver(PREF, prefObserver);

	// Support being installed while Zotero is already running
	for (let win of Zotero.getMainWindows()) {
		setupWindow(win);
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

	if (prefObserver) {
		try {
			Services.prefs.removeObserver(PREF, prefObserver);
		}
		catch (e) {
			// Ignore
		}
		prefObserver = null;
	}

	try {
		Zotero.MenuManager.unregisterMenu(MENU_ID);
	}
	catch (e) {
		// Ignore
	}

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
/* Window setup/teardown                                              */
/* ------------------------------------------------------------------ */

function setupWindow(win) {
	try {
		if (!win || !win.document || !win.document.getElementById("zotero-tabs-toolbar")) {
			return;
		}
		insertFTL(win);
		addToolbarButton(win);
		addKeyboardShortcut(win);
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
		if (win.__themeToggleKeyHandler) {
			win.removeEventListener("keydown", win.__themeToggleKeyHandler, true);
			delete win.__themeToggleKeyHandler;
		}
		let doc = win.document;
		doc.getElementById(BUTTON_ID)?.remove();
		doc.getElementById(KEY_ID)?.remove();
		doc.querySelector(`link[href="${FTL_FILE}"]`)?.remove();
	}
	catch (e) {
		// Ignore
	}
}

function insertFTL(win) {
	try {
		win.MozXULElement.insertFTLIfNeeded(FTL_FILE);
	}
	catch (e) {
		Zotero.logError(e);
	}
}

function addToolbarButton(win) {
	let doc = win.document;
	if (doc.getElementById(BUTTON_ID)) {
		return;
	}

	let toolbar = doc.getElementById("zotero-tabs-toolbar");
	if (!toolbar) {
		return;
	}

	let button = doc.createXULElement("toolbarbutton");
	button.id = BUTTON_ID;
	button.classList.add("zotero-tb-button");
	button.setAttribute("tabindex", "-1");
	button.setAttribute("aria-label", "Toggle Light/Dark Mode");
	button.setAttribute("tooltiptext", "Toggle Light/Dark Mode");
	button.style.setProperty("fill", "currentColor");
	button.style.setProperty("-moz-context-properties", "fill, fill-opacity");
	button.addEventListener("command", () => toggleTheme(win));

	let syncButton = doc.getElementById("zotero-tb-sync");
	if (syncButton && syncButton.parentNode === toolbar) {
		toolbar.insertBefore(button, syncButton);
	}
	else {
		toolbar.appendChild(button);
	}

	updateButton(win);
}

function addKeyboardShortcut(win) {
	if (win.__themeToggleKeyHandler) {
		return;
	}

	let handler = (event) => {
		if (event.defaultPrevented || event.isComposing || event.repeat) {
			return;
		}
		if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) {
			return;
		}
		if ((event.key || "").toLowerCase() !== "d") {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		toggleTheme(win);
	};

	win.addEventListener("keydown", handler, true);
	win.__themeToggleKeyHandler = handler;
}

/* ------------------------------------------------------------------ */
/* Theme logic                                                        */
/* ------------------------------------------------------------------ */

/**
 * @return {String} "dark" or "light" - the scheme currently in effect
 */
function getCurrentScheme(win) {
	let value = Services.prefs.getIntPref(PREF, 2);
	if (value === 0) {
		return "dark";
	}
	if (value === 1) {
		return "light";
	}
	try {
		return win.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	}
	catch (e) {
		return "light";
	}
}

function toggleTheme(win) {
	win = win || Zotero.getMainWindow();
	if (!win) {
		return;
	}

	let scheme = getCurrentScheme(win);
	// Switch to the opposite explicit scheme; the "follow system" option
	// remains available in Settings.
	Services.prefs.setIntPref(PREF, scheme === "dark" ? 1 : 0);

	for (let w of Zotero.getMainWindows()) {
		updateButton(w);
	}
}

function updateButton(win) {
	let doc = win?.document;
	let button = doc?.getElementById(BUTTON_ID);
	if (!button) {
		return;
	}

	let scheme = getCurrentScheme(win);
	// Show the mode the button will switch to
	let toLight = scheme === "dark";
	button.style.setProperty(
		"list-style-image",
		`url(chrome://${ADDON_REF}/content/icons/${toLight ? "sun" : "moon"}.svg)`
	);

	let fallback = toLight ? "Switch to light mode" : "Switch to dark mode";
	button.setAttribute("tooltiptext", fallback);
	button.setAttribute("aria-label", fallback);
	try {
		doc.l10n?.formatValue(toLight ? "theme-toggle-tip-go-light" : "theme-toggle-tip-go-dark")
			.then((text) => {
				button.setAttribute("tooltiptext", text);
				button.setAttribute("aria-label", text);
			})
			.catch(() => {});
	}
	catch (e) {
		// Ignore
	}
}
