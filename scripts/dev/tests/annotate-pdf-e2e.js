/*
 * End-to-end test suite for the Annotate PDF plugin (dev build only).
 *
 * Run against a running Zotero with the dev build installed:
 *   bash scripts/dev/run-job.sh scripts/dev/tests/annotate-pdf-e2e.js 180
 *
 * Everything happens in a scratch collection with generated test PDFs; all
 * created items/files are erased at the end.
 */
(async () => {
	const Z = Zotero;
	// Works both inside the dev channel (bare `AnnotatePDF` in scope) and when
	// driven from the Run JavaScript console (`Zotero.AnnotatePDF`).
	const A = (typeof AnnotatePDF !== "undefined" && AnnotatePDF) || Z.AnnotatePDF;
	if (!A) {
		throw new Error("AnnotatePDF API not found (is the dev build installed?)");
	}
	const T = PathUtils.tempDir;
	const P = (n) => PathUtils.join(T, n);
	// Timers created from JS must stay referenced until they fire, otherwise the
	// GC may collect the wrapper and silently cancel the timer (an easy way to
	// make a test hang).
	const pendingTimers = new Set();
	const onceTimer = (ms, cb) => {
		const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		pendingTimers.add(timer);
		timer.initWithCallback(() => {
			pendingTimers.delete(timer);
			cb();
		}, ms, Ci.nsITimer.TYPE_ONE_SHOT);
		return timer;
	};
	const delay = (ms) => new Promise((resolve) => onceTimer(ms, resolve));

	const steps = [];
	const progressPath = PathUtils.join(PathUtils.tempDir, "ap-e2e-progress.txt");
	let progressText = "";
	const noteProgress = (line) => {
		progressText += new Date().toISOString() + " " + line + "\n";
		try {
			Zotero.File.putContentsAsync(progressPath, progressText).catch(() => {});
		}
		catch (e) {
			// Ignore
		}
	};
	const guard = async (name, fn) => {
		noteProgress("start " + name);
		try {
			const value = await fn();
			steps.push({ name, ok: true, value: value === undefined ? null : value });
			noteProgress("done " + name);
			return value;
		}
		catch (e) {
			const message = (e && (e.stack || e.message)) || String(e);
			steps.push({ name, ok: false, error: message });
			noteProgress("failed " + name + ": " + message.split("\n")[0]);
			return undefined;
		}
	};

	const created = { items: [], collectionID: null, files: [] };

	/**
	 * Attachment managers (e.g. Attanger) move test files into the linked
	 * attachment base directory under a directory named after the item or
	 * collection. Remove our files there, and the directory if it ends up empty.
	 */
	const cleanupTestDirs = async () => {
		let removedDirs = 0;
		let basePath = "";
		try {
			basePath = Services.prefs.getStringPref("extensions.zotero.baseAttachmentPath", "");
		}
		catch (e) {
			basePath = "";
		}
		if (!basePath) {
			return 0;
		}
		try {
			if (!(await IOUtils.exists(basePath))) {
				return 0;
			}
			for (const entry of await IOUtils.getChildren(basePath)) {
				const dirName = PathUtils.filename(entry);
				if (!/^AnnotatePDF (Test|Exp|Debug|btn)/.test(dirName)) {
					continue;
				}
				try {
					for (const filePath of await IOUtils.getChildren(entry)) {
						if (/annotate-pdf-|ap-debug|ap-exp/.test(PathUtils.filename(filePath))) {
							await IOUtils.remove(filePath, { ignoreAbsent: true });
						}
					}
					if (!(await IOUtils.getChildren(entry)).length) {
						await IOUtils.remove(entry);
						removedDirs++;
					}
				}
				catch (e) {
					// Ignore
				}
			}
		}
		catch (e) {
			// Ignore
		}
		return removedDirs;
	};

	/**
	 * Resolve after at most `ms`, even if the wrapped promise never settles.
	 * (Zotero.Reader.open() occasionally hangs; the test must not.)
	 */
	const withTimeout = (promise, ms, label) => Promise.race([
		promise,
		new Promise((resolve, reject) => {
			onceTimer(ms, () => reject(new Error(label + ": timed out after " + ms + " ms")));
		}),
	]);

	const CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
	const newKey = () => Array.from(
		{ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]
	).join("");

	const buildPdf = (text, withForeignAnnotation = false) => {
		const enc = (s) => new TextEncoder().encode(s);
		const chunks = [];
		let offset = 0;
		const offsets = {};
		const push = (s) => {
			const b = enc(s);
			chunks.push(b);
			offset += b.length;
		};
		push("%PDF-1.4\n");
		offsets[1] = offset; push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
		offsets[2] = offset; push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
		offsets[3] = offset; push(
			"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]"
			+ " /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R"
			+ (withForeignAnnotation ? " /Annots [6 0 R]" : "")
			+ " >>\nendobj\n");
		const stream = "BT /F1 18 Tf 72 700 Td (" + text + ") Tj ET\n";
		offsets[4] = offset; push("4 0 obj\n<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream\nendobj\n");
		offsets[5] = offset; push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
		if (withForeignAnnotation) {
			// An annotation as another PDF app would write it: no /Zotero:Key, no
			// /NM starting with "Zotero-"
			offsets[6] = offset;
			push("6 0 obj\n<< /Type /Annot /Subtype /Highlight /Rect [100 500 300 512]"
				+ " /QuadPoints [100 512 300 512 100 500 300 500] /C [1 0.6 0]"
				+ " /Contents (foreign note) /F 4 >>\nendobj\n");
		}
		const objCount = withForeignAnnotation ? 7 : 6;
		const xrefOffset = offset;
		let xref = "xref\n0 " + objCount + "\n0000000000 65535 f \n";
		for (let i = 1; i < objCount; i++) {
			xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
		}
		push(xref);
		push("trailer\n<< /Size " + objCount + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n");
		const total = chunks.reduce((n, b) => n + b.length, 0);
		const out = new Uint8Array(total);
		let pos = 0;
		for (const b of chunks) {
			out.set(b, pos);
			pos += b.length;
		}
		return out;
	};

	const sortedRects = (position) => {
		const pos = typeof position === "string" ? JSON.parse(position) : position;
		return (pos.rects || [])
			.map((r) => r.map((n) => Math.round(n * 1000) / 1000).join(","))
			.sort()
			.join(";");
	};

	let attachment = null;
	let copyItem = null;
	let linkedCopyPath = null;
	let overwriteResult = null;
	let regularItem = null;
	let noteItem = null;

	try {
		/* ---- 0. environment --------------------------------------------- */
		await guard("env", async () => {
			// Keep failures from blocking the run with modal alerts
			try {
				Services.prefs.setBoolPref("extensions.zotero.annotate-pdf.silentErrors", true);
			}
			catch (e) {
				// Ignore
			}
			return {
				zotero: Z.version,
				menuRegistration: A.menuRegistration,
				defaultAction: Services.prefs.getStringPref("extensions.zotero.annotate-pdf.defaultAction", "MISSING"),
				outputDir: Services.prefs.getStringPref("extensions.zotero.annotate-pdf.outputDir", "MISSING"),
				silentErrors: Services.prefs.getBoolPref("extensions.zotero.annotate-pdf.silentErrors", false),
				l10nMenu: await Z.getMainWindow().document.l10n.formatValue("annotate-pdf-menu"),
				l10nToolbarTip: await Z.getMainWindow().document.l10n.formatValue("annotate-pdf-toolbar-tip"),
				locale: Z.locale,
			};
		});

		/* ---- 1. test PDF + scratch collection --------------------------- */
		await guard("purge-leftovers", async () => {
			const purged = { collections: 0, annotations: 0, items: 0 };
			const stale = Z.Collections.getByLibrary(Z.Libraries.userLibraryID, true)
				.filter((c) => /^AnnotatePDF (Test|Debug) /.test(c.name));
			for (const c of stale) {
				purged.collections++;
				if (!c.deleted) {
					await c.eraseTx();
				}
			}
			const all = await Z.Items.getAll(Z.Libraries.userLibraryID, null, true);
			const targets = all.filter((i) => {
				if (i.deleted) {
					return false;
				}
				let title = i.getField && i.getField("title");
				if (!title) {
					try {
						const path = i.getFilePath && i.getFilePath();
						title = path && PathUtils.filename(path);
					}
					catch (e) {
						// Ignore
					}
				}
				return title && /^(annotate-pdf-|ap-debug)/.test(title);
			});
			const annIDs = targets.filter((i) => i.isAnnotation()).map((i) => i.id);
			const itemIDs = targets.filter((i) => !i.isAnnotation()).map((i) => i.id);
			if (annIDs.length) {
				await Z.Items.erase(annIDs);
			}
			if (itemIDs.length) {
				await Z.Items.erase(itemIDs);
			}
			purged.annotations = annIDs.length;
			purged.items = itemIDs.length;
			purged.dirs = await cleanupTestDirs();
			return purged;
		});

		const pdfPath = P("annotate-pdf-test.pdf");
		await IOUtils.write(pdfPath, buildPdf("Annotate PDF test page"));
		created.files.push(pdfPath);

		const collection = new Z.Collection();
		collection.libraryID = Z.Libraries.userLibraryID;
		collection.name = "AnnotatePDF Test " + Date.now();
		await collection.saveTx();
		created.collectionID = collection.id;

		attachment = await guard("import-test-pdf", () => Z.Attachments.importFromFile({
			file: Z.File.pathToFile(pdfPath),
			libraryID: Z.Libraries.userLibraryID,
			collections: [collection.id],
			title: "annotate-pdf-test",
		}));
		if (!attachment) {
			throw new Error("test attachment could not be created");
		}
		created.items.push(attachment.id);
		await guard("attachment-info", () => ({
			id: attachment.id,
			linkMode: attachment.attachmentLinkMode,
			isPDF: attachment.isPDFAttachment(),
		}));

		/* ---- 2. add annotations ----------------------------------------- */
		const positions = [
			{ pageIndex: 0, rects: [[100, 500, 300, 512], [110, 520, 280, 532]] },
			{ pageIndex: 0, rects: [[120, 560, 320, 566]] },
			{ pageIndex: 0, rects: [[80, 600, 102, 622]] },
		];
		const annotationJSONs = [
			{
				key: newKey(), type: "highlight", text: "sample text 1", comment: "评论 1",
				color: "#ffd400", pageLabel: "1", sortIndex: "00001|000100|00201",
				position: positions[0], authorName: "tester",
			},
			{
				key: newKey(), type: "underline", text: "sample text 2", comment: "comment 2",
				color: "#2ea8e5", pageLabel: "1", sortIndex: "00001|000110|00211",
				position: positions[1], authorName: "tester",
			},
			{
				key: newKey(), type: "note", text: "", comment: "sticky note",
				color: "#ff6666", pageLabel: "1", sortIndex: "00001|000120|00221",
				position: positions[2], authorName: "tester",
			},
		];
		const originals = await guard("add-annotations", async () => {
			for (const json of annotationJSONs) {
				await Z.Annotations.saveFromJSON(attachment, json);
			}
			const anns = attachment.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return anns.map((a) => ({
				id: a.id, key: a.key, type: a.annotationType, color: a.annotationColor,
				comment: a.annotationComment, rects: sortedRects(a.annotationPosition),
			}));
		});

		/* ---- 2b. a regular item with a PDF child (the library-item case) - */
		await guard("create-regular-item", async () => {
			regularItem = new Z.Item("journalArticle");
			regularItem.libraryID = Z.Libraries.userLibraryID;
			regularItem.setField("title", "annotate-pdf-regular-test");
			regularItem.setCollections([collection.id]);
			await regularItem.saveTx();
			created.items.push(regularItem.id);

			const child = await Z.Attachments.importFromFile({
				file: Z.File.pathToFile(pdfPath),
				parentItemID: regularItem.id,
				title: "annotate-pdf-regular-child",
			});
			created.items.push(child.id);
			await Z.Annotations.saveFromJSON(child, {
				key: newKey(), type: "highlight", text: "regular text", comment: "regular comment",
				color: "#ffd400", pageLabel: "1", sortIndex: "00001|000100|00230",
				position: { pageIndex: 0, rects: [[130, 540, 330, 552]] },
				authorName: "tester",
			});
			created.items.push(...child.getAnnotations().map((a) => a.id));

			noteItem = new Z.Item("note");
			noteItem.libraryID = Z.Libraries.userLibraryID;
			noteItem.setNote("<p>annotate-pdf-note-test</p>");
			noteItem.setCollections([collection.id]);
			await noteItem.saveTx();
			created.items.push(noteItem.id);

			return {
				regularItemID: regularItem.id,
				childAttachmentID: child.id,
				noteItemID: noteItem.id,
			};
		});

		/* ---- 3. copy mode (stored attachment -> new attachment) --------- */
		const copy = await guard("copy-mode", () => A.writeForAttachment(attachment, "copy"));
		if (copy && copy.itemID) {
			copyItem = Z.Items.get(copy.itemID);
			created.items.push(copy.itemID);
		}
		await guard("copy-info", () => ({
			status: copy && copy.status,
			count: copy && copy.count,
			path: copy && copy.path,
			isPDFAttachment: copyItem ? copyItem.isPDFAttachment() : null,
		}));

		/* ---- 4. round trip: import embedded annotations back ------------- */
		await guard("roundtrip-from-copy", async () => {
			if (!copyItem) {
				throw new Error("no copy attachment");
			}
			const changed = await Z.PDFWorker.import(copyItem.id, true, "", false);
			const imported = copyItem.getAnnotations();
			created.items.push(...imported.map((a) => a.id));
			const comparison = imported.map((x) => {
				const orig = (originals || []).find((o) => {
					const match = o.comment === x.annotationComment;
					return match;
				});
				return {
					type: x.annotationType,
					color: x.annotationColor,
					comment: x.annotationComment,
					rects: sortedRects(x.annotationPosition),
					matchesOriginal: orig ? {
						type: orig.type === x.annotationType,
						color: orig.color === x.annotationColor,
						comment: orig.comment === x.annotationComment,
						rects: orig.rects === sortedRects(x.annotationPosition),
					} : null,
				};
			});
			return { changed, importedCount: imported.length, comparison };
		});

		/* ---- 5. overwrite mode ------------------------------------------ */
		overwriteResult = await guard("overwrite-mode", () => A.writeForAttachment(attachment, "overwrite"));
		await guard("overwrite-effects", async () => {
			// Force backups on for this step (the user's preference may disable them)
			const pref = "extensions.zotero.annotate-pdf.backupOnOverwrite";
			const prev = Services.prefs.getBoolPref(pref, true);
			Services.prefs.setBoolPref(pref, true);
			try {
				const result = await A.writeForAttachment(attachment, "overwrite");
				if (!result || result.status !== "ok") {
					throw new Error("overwrite did not succeed: " + JSON.stringify(result));
				}
				return {
					status: result.status,
					count: result.count,
					strippedEmbedded: result.strippedEmbedded,
					backupPath: result.backupPath,
					backupExists: result.backupPath ? await IOUtils.exists(result.backupPath) : null,
					dbAnnotationCount: A.annotationCount(attachment),
					hasAnnotationsInFile: await Z.PDFWorker.hasAnnotations(attachment.id),
				};
			}
			finally {
				Services.prefs.setBoolPref(pref, prev);
			}
		});

		/* ---- 5a. cold PDF worker still works ---------------------------- */
		await guard("cold-worker-strip", async () => {
			const srcPath = await attachment.getFilePathAsync();
			// Simulate a cold worker (as right after a Zotero restart): calling the
			// worker directly used to fail with "this._worker is null"
			Zotero.PDFWorker._worker = null;
			const embedded = await A.readEmbeddedAnnotations(srcPath, "", attachment.id);
			const write = await A.writeForAttachment(attachment, "overwrite");
			return {
				embeddedCount: embedded.length,
				status: write.status,
				strippedEmbedded: write.strippedEmbedded,
				count: write.count,
				workerAlive: !!Zotero.PDFWorker._worker,
			};
		});

		/* ---- 5b. overwrite without a backup ----------------------------- */
		await guard("overwrite-no-backup", async () => {
			const pref = "extensions.zotero.annotate-pdf.backupOnOverwrite";
			const prev = Services.prefs.getBoolPref(pref, true);
			try {
				Services.prefs.setBoolPref(pref, false);
				const srcPath = await attachment.getFilePathAsync();
				const bakPath = srcPath.replace(/\.pdf$/i, "") + ".bak.pdf";
				await IOUtils.remove(bakPath, { ignoreAbsent: true });
				const result = await A.writeForAttachment(attachment, "overwrite");
				return {
					status: result.status,
					backupPath: result.backupPath === undefined ? null : result.backupPath,
					backupCreated: await IOUtils.exists(bakPath),
					hasAnnotationsInFile: await Z.PDFWorker.hasAnnotations(attachment.id),
					dbAnnotationCount: A.annotationCount(attachment),
				};
			}
			finally {
				Services.prefs.setBoolPref(pref, prev);
			}
		});

		/* ---- 5c. repeated overwrite must not stack duplicates ----------- */
		await guard("overwrite-twice-no-stacking", async () => {
			const srcPath = await attachment.getFilePathAsync();
			// Every annotation written by Zotero carries "/NM (Zotero-<key>)", so
			// counting that marker in the raw bytes reveals duplicate copies.
			const countMarkers = async () => {
				const bytes = await IOUtils.read(srcPath);
				const text = new TextDecoder("latin1").decode(bytes);
				return text.split("Zotero-").length - 1;
			};
			const dbCount = A.annotationCount(attachment);
			const before = await countMarkers();
			const result = await A.writeForAttachment(attachment, "overwrite");
			const after = await countMarkers();
			return {
				dbCount,
				markersBefore: before,
				markersAfter: after,
				strippedEmbedded: result.strippedEmbedded,
				stacked: after !== before,
				clean: after === before && after >= dbCount,
			};
		});

		/* ---- 5d. annotations from other apps are adopted ---------------- */
		await guard("adopt-foreign-annotations", async () => {
			// A PDF that already carries an annotation written by another app
			const foreignPdf = P("annotate-pdf-foreign.pdf");
			await IOUtils.write(foreignPdf, buildPdf("Foreign test page", true));
			created.files.push(foreignPdf);
			const item = await Z.Attachments.importFromFile({
				file: Z.File.pathToFile(foreignPdf),
				libraryID: Z.Libraries.userLibraryID,
				collections: [collection.id],
				title: "annotate-pdf-foreign",
			});
			created.items.push(item.id);
			await Z.Annotations.saveFromJSON(item, {
				key: newKey(), type: "highlight", text: "our text", comment: "our comment",
				color: "#ffd400", pageLabel: "1", sortIndex: "00001|000100|00240",
				position: { pageIndex: 0, rects: [[150, 400, 350, 412]] },
				authorName: "tester",
			});
			created.items.push(...item.getAnnotations().map((a) => a.id));

			const write = await A.writeForAttachment(item, "overwrite");
			const after = item.getAnnotations();
			const embedded = await A.readEmbeddedAnnotations(await item.getFilePathAsync(), "", item.id);
			return {
				status: write.status,
				adopted: write.adoptedEmbedded,
				dbTotal: after.length,
				dbExternal: after.filter((a) => a.annotationIsExternal).length,
				foreignNowEditable: after.some((a) => !a.annotationIsExternal
					&& (a.annotationComment || "") === "foreign note"),
				ourCopies: after.filter((a) => (a.annotationComment || "") === "our comment").length,
				embeddedCount: embedded.length,
				foreignStillIdless: embedded.filter((a) => !a.id).length,
			};
		});

		/* ---- 5e. read-only duplicates are trashed by a write ------------ */
		await guard("trash-duplicate-externals", async () => {
			// Simulate what Zotero does when the written file is opened: the
			// embedded annotations are imported as read-only copies
			attachment.attachmentLastProcessedModificationTime = 0;
			await attachment.saveTx({ skipAll: true });
			await Z.PDFWorker.import(attachment.id, true, "", false);
			const externalsBefore = attachment.getAnnotations()
				.filter((a) => a.annotationIsExternal).length;
			const write = await A.writeForAttachment(attachment, "overwrite");
			const after = attachment.getAnnotations();
			return {
				externalsBefore,
				trashed: write.trashedExternalItems,
				externalsAfter: after.filter((a) => a.annotationIsExternal).length,
				dbTotal: after.length,
				status: write.status,
				clean: externalsBefore > 0 && write.trashedExternalItems === externalsBefore
					&& after.filter((a) => a.annotationIsExternal).length === 0,
			};
		});

		/* ---- 6. open reader on the original: no duplicate imports ------- */
		await guard("reader-open-original", () => withTimeout((async () => {
			const before = attachment.getAnnotations().length;
			noteProgress("  reader-open: calling Reader.open");
			await Z.Reader.open(attachment.id, undefined, { allowDuplicate: true });
			noteProgress("  reader-open: resolved");
			await delay(3000);
			const reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
			return {
				before,
				after: attachment.getAnnotations().length,
				readerFound: !!reader,
			};
		})(), 45000, "reader-open-original"));

		/* ---- 7. reader toolbar button ---------------------------------- */
		await guard("reader-toolbar-button", () => withTimeout((async () => {
			// Force the copy action for this step, so the result is a new attachment
			// regardless of the user's defaultAction preference
			const pref = "extensions.zotero.annotate-pdf.defaultAction";
			const prevMode = Services.prefs.getStringPref(pref, "copy");
			Services.prefs.setStringPref(pref, "copy");
			let reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
			if (!reader) {
				noteProgress("  button: opening reader");
				await Z.Reader.open(attachment.id, undefined, { allowDuplicate: true });
			}
			// The reader document/toolbar renders asynchronously
			let button = null;
			let waitMs = null;
			for (let i = 0; i < 40 && !button; i++) {
				await delay(500);
				reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
				const doc = reader && reader._iframeWindow && reader._iframeWindow.document;
				button = doc && doc.getElementById("annotate-pdf-reader-button");
				if (button) {
					waitMs = (i + 1) * 500;
				}
			}
			const info = { found: !!button, waitMs };
			if (button) {
				const icon = button.querySelector(".toolbar-button-icon");
				const style = icon ? reader._iframeWindow.getComputedStyle(icon) : null;
				info.title = button.getAttribute("title");
				info.className = button.className;
				info.maskImage = style ? String(style.maskImage || "").slice(0, 80) : null;
				info.size = button.getBoundingClientRect ? [Math.round(button.getBoundingClientRect().width), Math.round(button.getBoundingClientRect().height)] : null;

				const countAttachments = () => collection.getChildItems()
					.filter((i) => i.isAttachment() && !created.items.includes(i.id)).map((i) => i.id);
				const before = countAttachments();
				noteProgress("  button: clicking");
				button.click();
				// wait for the action to produce a new attachment (bounded)
				for (let i = 0; i < 20; i++) {
					await delay(500);
					const now = countAttachments();
					if (now.some((id) => !before.includes(id))) {
						break;
					}
				}
				info.newAttachments = countAttachments().filter((id) => !before.includes(id));
				info.clickWorked = info.newAttachments.length > 0;
				created.items.push(...info.newAttachments);
			}
			Services.prefs.setStringPref(pref, prevMode);
			return info;
		})(), 60000, "reader-toolbar-button"));

		/* ---- 8. menu build + visibility logic -------------------------- */
		await guard("menu-build", async () => {
			const win = Z.getMainWindow();
			// Use the real item menu so the plugin's own popupshowing listener runs
			const popup = win.document.getElementById("zotero-itemmenu")
				|| win.document.createXULElement("menupopup");
			const attached = !popup.isConnected;
			if (attached) {
				(win.document.getElementById("mainPopupSet") || win.document.documentElement).appendChild(popup);
			}
			const findItem = () => Array.from(popup.children).find(
				(x) => x.classList.contains("annotate-pdf-menu-item")
					|| (x.dataset && x.dataset.l10nId === "annotate-pdf-menu")
			);
			const build = (items) => {
				Z.MenuManager.updateMenuPopup(popup, "main/library/item", {
					getContext: () => ({ items, tabType: "library", tabID: "zotero-pane" }),
				});
				// ZoteroPane does not pass an event, so the hooks are registered
				// as popupshowing listeners - dispatch it to run them
				popup.dispatchEvent(new win.CustomEvent("popupshowing"));
				const el = findItem();
				return el
					? { tag: el.localName, hidden: !!el.hidden, disabled: !!el.disabled, l10n: el.dataset.l10nId || null }
					: null;
			};
			try {
				const results = {
					pdfAttachment: build([attachment]),
					regularItemWithPDF: regularItem ? build([regularItem]) : "no regular item",
					nonPDFItem: noteItem ? build([noteItem]) : "no non-PDF item",
					emptySelection: build([]),
				};
				results.found = !!results.pdfAttachment;
				// the marker (glyph or icon) is applied asynchronously
				await delay(600);
				const el = findItem();
				results.marker = el ? {
					label: el.getAttribute("label"),
					hasGlyph: !!el.getAttribute("label")
						&& el.getAttribute("label").startsWith("🖍"),
					iconic: el.classList.contains("menuitem-iconic"),
					marked: el.classList.contains("annotate-pdf-menu-item"),
				} : null;
				return results;
			}
			finally {
				if (attached) {
					popup.remove();
				}
			}
		});

		/* ---- 8b. regular item expansion + write ------------------------ */
		await guard("regular-item-expansion", () => {
			if (!regularItem) {
				throw new Error("no regular item");
			}
			const expanded = A.expandToPDFAttachments([regularItem]);
			return {
				expandedCount: expanded.length,
				expandedIsChild: expanded.length === 1 && expanded[0].parentID === regularItem.id,
			};
		});
		await guard("regular-item-write", async () => {
			if (!regularItem) {
				throw new Error("no regular item");
			}
			const childIDs = regularItem.getAttachments();
			const child = Z.Items.get(childIDs[0]);
			const linkMode = child.attachmentLinkMode;
			const isLinked = linkMode === Z.Attachments.LINK_MODE_LINKED_FILE;
			const srcPath = await child.getFilePathAsync();

			const results = await A.runAction("copy", [regularItem]);
			const raw = results.map((r) => ({
				status: r.status, mode: r.mode, count: r.count, itemID: r.itemID, path: r.path,
			}));
			for (const r of results) {
				if (r.status === "ok" && r.path) {
					created.files.push(r.path);
				}
			}
			const newIDs = results.filter((r) => r.status === "ok" && r.itemID).map((r) => r.itemID);
			created.items.push(...newIDs);
			const copyItem = newIDs.length ? Z.Items.get(newIDs[0]) : null;

			// An attachment manager (e.g. Attanger) may turn the imported child into
			// a linked file; in that case the copy is written next to the source.
			const branch = isLinked
				? {
					linkedFileBranch: true,
					copyNextToSource: results[0] && results[0].path
						? PathUtils.parent(results[0].path) === PathUtils.parent(srcPath)
						: null,
					copyFileExists: results[0] && results[0].path
						? await IOUtils.exists(results[0].path)
						: null,
				}
				: {
					linkedFileBranch: false,
					createdCopy: !!copyItem,
					copyIsChildOfRegularItem: copyItem ? copyItem.parentID === regularItem.id : null,
					copyIsPDF: copyItem ? copyItem.isPDFAttachment() : null,
					hasAnnotations: copyItem ? await Z.PDFWorker.hasAnnotations(copyItem.id) : null,
				};
			return {
				linkMode,
				statuses: results.map((r) => r.status),
				raw,
				...branch,
			};
		});

		/* ---- 9. linked file copy -------------------------------------- */
		const linkedResult = await guard("linked-file-copy", async () => {
			const srcPath = P("annotate-pdf-linked.pdf");
			await IOUtils.write(srcPath, buildPdf("Linked test page"));
			created.files.push(srcPath);
			const linked = await Z.Attachments.linkFromFile({
				file: srcPath,
				libraryID: Z.Libraries.userLibraryID,
				collections: [collection.id],
				title: "annotate-pdf-linked",
			});
			created.items.push(linked.id);
			await Z.Annotations.saveFromJSON(linked, {
				key: newKey(), type: "highlight", text: "linked text", comment: "linked comment",
				color: "#ffd400", pageLabel: "1", sortIndex: "00001|000100|00250",
				position: { pageIndex: 0, rects: [[90, 480, 250, 492]] },
				authorName: "tester",
			});
			created.items.push(...linked.getAnnotations().map((a) => a.id));
			const result = await A.writeForAttachment(linked, "copy");
			linkedCopyPath = result && result.path;
			if (linkedCopyPath) {
				created.files.push(linkedCopyPath);
			}
			return {
				status: result && result.status,
				message: result && result.message,
				count: result && result.count,
				destPath: linkedCopyPath,
				sameDirAsSource: linkedCopyPath
					? PathUtils.parent(linkedCopyPath) === PathUtils.parent(srcPath)
					: null,
				expectedBaseName: A.annotatedBaseName(srcPath),
				actualFileName: linkedCopyPath ? PathUtils.filename(linkedCopyPath) : null,
				exists: linkedCopyPath ? await IOUtils.exists(linkedCopyPath) : null,
			};
		});
		if (linkedResult) {
			await guard("linked-copy-content-check", async () => {
				const imported = await Z.Attachments.importFromFile({
					file: Z.File.pathToFile(linkedCopyPath),
					libraryID: Z.Libraries.userLibraryID,
					collections: [collection.id],
					title: "annotate-pdf-linked-copy-verify",
				});
				created.items.push(imported.id);
				const changed = await Z.PDFWorker.import(imported.id, true, "", false);
				const anns = imported.getAnnotations();
				created.items.push(...anns.map((a) => a.id));
				return {
					changed,
					count: anns.length,
					comment: anns.length ? anns[0].annotationComment : null,
					rectsMatch: anns.length ? sortedRects(anns[0].annotationPosition) === sortedRects({ rects: [[90, 480, 250, 492]] }) : null,
				};
			});
		}
	}
	catch (e) {
		steps.push({ name: "suite", ok: false, error: (e && (e.stack || e.message)) || String(e) });
	}
	finally {
		/* ---- cleanup ---------------------------------------------------- */
		await guard("cleanup", async () => {
			// close readers
			for (const reader of (Z.Reader._readers || []).slice()) {
				try {
					reader.close();
				}
				catch (e) {
					try {
						Z.getMainWindow().Zotero_Tabs.close(reader.tabID);
					}
					catch (e2) {
						// Ignore
					}
				}
			}
			const annotationIDs = [];
			const itemIDs = [];
			for (const id of created.items) {
				const item = Z.Items.get(id);
				if (!item) {
					continue;
				}
				(item.isAnnotation() ? annotationIDs : itemIDs).push(id);
			}
			if (annotationIDs.length) {
				await Z.Items.erase(annotationIDs);
			}
			if (itemIDs.length) {
				await Z.Items.erase(itemIDs);
			}
			if (created.collectionID) {
				const collection = Z.Collections.get(created.collectionID);
				if (collection && !collection.deleted) {
					await collection.eraseTx();
				}
			}
			for (const path of created.files) {
				await IOUtils.remove(path, { ignoreAbsent: true }).catch(() => {});
			}
			// Attachment managers (e.g. Attanger) move test files into the linked
			// attachment base directory under a directory named after the item or
			// collection. Remove our files there and the directory if it is empty.
			const removedDirs = await cleanupTestDirs();
			try {
				Services.prefs.clearUserPref("extensions.zotero.annotate-pdf.silentErrors");
			}
			catch (e) {
				// Ignore
			}
			return {
				erasedAnnotations: annotationIDs.length,
				erasedItems: itemIDs.length,
				removedFiles: created.files.length,
				removedDirs,
			};
		});
	}

	const failed = steps.filter((s) => s.ok === false).map((s) => s.name);
	const report = { suite: "annotate-pdf-e2e", failed, steps };
	const reportPath = P("ap-e2e-report.json");
	try {
		await Zotero.File.putContentsAsync(reportPath, JSON.stringify(report, null, 2));
	}
	catch (e) {
		// Ignore
	}
	if (typeof done === "function") {
		done(report);
	}
	return report;
})().then(null, (e) => {
	const error = { suite: "annotate-pdf-e2e", fatal: String((e && e.stack) || e) };
	try {
		Zotero.File.putContentsAsync(
			PathUtils.join(PathUtils.tempDir, "ap-e2e-report.json"),
			JSON.stringify(error, null, 2)
		);
	}
	catch (e2) {
		// Ignore
	}
	if (typeof done === "function") {
		done(error);
	}
});
