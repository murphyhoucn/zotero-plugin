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
	const delay = (ms) => new Promise((resolve) => {
		const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		timer.initWithCallback(resolve, ms, Ci.nsITimer.TYPE_ONE_SHOT);
	});

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

	const CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
	const newKey = () => Array.from(
		{ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]
	).join("");

	const buildPdf = (text) => {
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
			+ " /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");
		const stream = "BT /F1 18 Tf 72 700 Td (" + text + ") Tj ET\n";
		offsets[4] = offset; push("4 0 obj\n<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream\nendobj\n");
		offsets[5] = offset; push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
		const xrefOffset = offset;
		let xref = "xref\n0 6\n0000000000 65535 f \n";
		for (let i = 1; i <= 5; i++) {
			xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
		}
		push(xref);
		push("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n");
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
				l10nMenuCopy: await Z.getMainWindow().document.l10n.formatValue("annotate-pdf-menu-copy"),
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
			if (!overwriteResult || overwriteResult.status !== "ok") {
				throw new Error("overwrite did not succeed: " + JSON.stringify(overwriteResult));
			}
			return {
				status: overwriteResult.status,
				count: overwriteResult.count,
				backupPath: overwriteResult.backupPath,
				backupExists: await IOUtils.exists(overwriteResult.backupPath),
				dbAnnotationCount: A.annotationCount(attachment),
				hasAnnotationsInFile: await Z.PDFWorker.hasAnnotations(attachment.id),
			};
		});

		/* ---- 6. open reader on the original: no duplicate imports ------- */
		await guard("reader-open-original", async () => {
			const before = attachment.getAnnotations().length;
			await Z.Reader.open(attachment.id, undefined, { allowDuplicate: true });
			await delay(3000);
			const reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
			return {
				before,
				after: attachment.getAnnotations().length,
				readerFound: !!reader,
			};
		});

		/* ---- 7. reader toolbar button ---------------------------------- */
		await guard("reader-toolbar-button", async () => {
			let reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
			if (!reader) {
				await Z.Reader.open(attachment.id, undefined, { allowDuplicate: true });
			}
			// The reader document/toolbar renders asynchronously
			let button = null;
			let waitMs = null;
			for (let i = 0; i < 40; i++) {
				await delay(500);
				reader = (Z.Reader._readers || []).find((r) => r.itemID === attachment.id);
				const doc = reader && reader._iframeWindow && reader._iframeWindow.document;
				button = doc && doc.getElementById("annotate-pdf-reader-button");
				if (button) {
					waitMs = (i + 1) * 500;
					break;
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
				button.click();
				await delay(4000);
				const after = countAttachments();
				info.newAttachments = after.filter((id) => !before.includes(id));
				info.clickWorked = info.newAttachments.length > 0;
				created.items.push(...info.newAttachments);
			}
			return info;
		});

		/* ---- 8. menu popup build --------------------------------------- */
		await guard("menu-popup-build", async () => {
			const win = Z.getMainWindow();
			const popup = win.document.createXULElement("menupopup");
			const host = win.document.getElementById("mainPopupSet") || win.document.documentElement;
			host.appendChild(popup);
			try {
				Z.MenuManager.updateMenuPopup(popup, "main/library/item", {});
				const dump = (node, depth) => Array.from(node.children).map((el) => ({
					tag: el.localName,
					id: el.id || null,
					l10n: (el.dataset && el.dataset.l10nId) || null,
					hidden: el.hidden === true ? true : undefined,
					disabled: el.disabled === true ? true : undefined,
					children: depth < 2 ? dump(el, depth + 1) : undefined,
				}));
				const tree = dump(popup, 0);
				// Submenu children are built lazily on popupshowing (MenuManager)
				let submenuChildren = null;
				const submenu = Array.from(popup.children).find(
					(el) => el.dataset && el.dataset.l10nId === "annotate-pdf-menu"
				);
				if (submenu) {
					const subPopup = submenu.querySelector("menupopup");
					if (subPopup) {
						subPopup.dispatchEvent(new win.CustomEvent("popupshowing"));
						submenuChildren = dump(subPopup, 0);
					}
				}
				return {
					found: JSON.stringify(tree).includes("annotate-pdf-menu"),
					tree,
					submenuChildren,
				};
			}
			finally {
				popup.remove();
			}
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
