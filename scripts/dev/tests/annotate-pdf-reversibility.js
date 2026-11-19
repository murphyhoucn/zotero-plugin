/*
 * Reversibility / round-trip semantics suite for the Annotate PDF plugin.
 *
 * Answers, with measurements, what happens to the database and to the file when
 * annotations are written into a PDF and later imported back:
 *
 *   A1 = a Zotero-stored PDF with 2 database annotations
 *   A2 = an "annotated copy" of A1 (file carries the annotations, A2's database has none)
 *
 *   E2: import A2's embedded annotations twice - once as the automatic check does
 *       (transfer = false, read-only "external" items) and once as the reader's
 *       "Import Annotations…" does (transfer = true, moved into the database and
 *       stripped from the file).
 *   A1: overwrite the original (file now carries the annotations that are also in
 *       the database), then
 *   E1: clear the "last processed" watermark and force the automatic check.
 *   E3: run a transfer import on A1 as well.
 *
 * Run (dev build): bash scripts/dev/run-job.sh scripts/dev/tests/annotate-pdf-reversibility.js 120
 * Everything is created in a scratch collection and erased afterwards; results
 * are also written to <temp>/ap-exp-report.json.
 */
(async () => {
	const Z = Zotero;
	const A = (typeof AnnotatePDF !== "undefined" && AnnotatePDF) || Z.AnnotatePDF;
	if (!A) {
		throw new Error("AnnotatePDF API not found (is the plugin installed?)");
	}
	const T = PathUtils.tempDir;
	const P = (n) => PathUtils.join(T, n);
	const delay = (ms) => new Promise((resolve) => {
		const t = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
		t.initWithCallback(resolve, ms, Ci.nsITimer.TYPE_ONE_SHOT);
	});

	const steps = [];
	const guard = async (name, fn) => {
		try {
			const v = await fn();
			steps.push({ name, ok: true, value: v === undefined ? null : v });
			return v;
		}
		catch (e) {
			steps.push({ name, ok: false, error: (e && (e.stack || e.message)) || String(e) });
			return undefined;
		}
	};

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
		const res = new Uint8Array(total);
		let pos = 0;
		for (const b of chunks) {
			res.set(b, pos);
			pos += b.length;
		}
		return res;
	};

	const created = { items: [], collectionID: null, files: [] };

	const summarize = async (attachment, label) => {
		const anns = attachment.getAnnotations();
		return {
			label,
			dbAnnotations: anns.length,
			external: anns.filter((a) => a.annotationIsExternal).length,
			hasAnnotationsInFile: await Z.PDFWorker.hasAnnotations(attachment.id),
			comments: anns.map((a) => a.annotationComment),
		};
	};

	let a1 = null;
	let a2 = null;

	try {
		const pdfPath = P("ap-exp.pdf");
		await IOUtils.write(pdfPath, buildPdf("Reversibility test"));
		created.files.push(pdfPath);

		const collection = new Z.Collection();
		collection.libraryID = Z.Libraries.userLibraryID;
		collection.name = "AnnotatePDF Exp " + Date.now();
		await collection.saveTx();
		created.collectionID = collection.id;

		a1 = await guard("create-A1", () => Z.Attachments.importFromFile({
			file: Z.File.pathToFile(pdfPath),
			libraryID: Z.Libraries.userLibraryID,
			collections: [collection.id],
			title: "ap-exp-original",
		}));
		if (!a1) {
			throw new Error("test attachment could not be created");
		}
		created.items.push(a1.id);

		await guard("add-annotations-A1", async () => {
			for (const spec of [
				{ type: "highlight", comment: "orig highlight", rects: [[100, 500, 300, 512]] },
				{ type: "underline", comment: "orig underline", rects: [[120, 560, 320, 566]] },
			]) {
				await Z.Annotations.saveFromJSON(a1, {
					key: newKey(), type: spec.type, text: "text", comment: spec.comment,
					color: "#ffd400", pageLabel: "1", sortIndex: "00001|000100|00200",
					position: { pageIndex: 0, rects: spec.rects }, authorName: "tester",
				});
			}
			const anns = a1.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return anns.map((a) => ({ key: a.key, comment: a.annotationComment, external: a.annotationIsExternal }));
		});

		/* ---- A2: an annotated copy (file carries them, DB has none) ----- */
		const copy = await guard("copy-A1-to-A2", () => A.writeForAttachment(a1, "copy"));
		a2 = copy && copy.itemID ? Z.Items.get(copy.itemID) : null;
		if (a2) {
			created.items.push(a2.id);
		}

		/* ---- E2: import from A2 ----------------------------------------- */
		await guard("E2-A2-before", () => summarize(a2, "A2 before"));
		await guard("E2-A2-import-nontransfer", async () => {
			const changed = await Z.PDFWorker.import(a2.id, true, "", false);
			const anns = a2.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return { changed, ...(await summarize(a2, "A2 after non-transfer import")) };
		});
		await guard("E2-A2-import-transfer", async () => {
			const changed = await Z.PDFWorker.import(a2.id, true, "", true);
			const anns = a2.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return { changed, ...(await summarize(a2, "A2 after transfer import")) };
		});

		/* ---- A1: overwrite the original --------------------------------- */
		await guard("overwrite-A1", () => A.writeForAttachment(a1, "overwrite"));
		await guard("A1-after-overwrite", () => summarize(a1, "A1 after overwrite"));

		/* ---- E1: force the automatic import check ----------------------- */
		await guard("E1-A1-force-import-nontransfer", async () => {
			a1.attachmentLastProcessedModificationTime = 0;
			await a1.saveTx({ skipAll: true });
			const changed = await Z.PDFWorker.import(a1.id, true, "", false);
			const anns = a1.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return { changed, ...(await summarize(a1, "A1 after forced non-transfer import")) };
		});

		/* ---- E3: transfer import on A1 ---------------------------------- */
		await guard("E3-A1-import-transfer", async () => {
			const changed = await Z.PDFWorker.import(a1.id, true, "", true);
			const anns = a1.getAnnotations();
			created.items.push(...anns.map((a) => a.id));
			return { changed, ...(await summarize(a1, "A1 after transfer import")) };
		});
	}
	catch (e) {
		steps.push({ name: "experiment", ok: false, error: (e && (e.stack || e.message)) || String(e) });
	}
	finally {
		await guard("cleanup", async () => {
			for (const r of (Z.Reader._readers || []).slice()) {
				try {
					r.close();
				}
				catch (e) {
					try {
						Z.getMainWindow().Zotero_Tabs.close(r.tabID);
					}
					catch (e2) {
						// Ignore
					}
				}
			}
			const annotationIDs = [];
			const itemIDs = [];
			for (const id of created.items) {
				const it = Z.Items.get(id);
				if (!it) {
					continue;
				}
				(it.isAnnotation() ? annotationIDs : itemIDs).push(id);
			}
			if (annotationIDs.length) {
				await Z.Items.erase(annotationIDs);
			}
			if (itemIDs.length) {
				await Z.Items.erase(itemIDs);
			}
			if (created.collectionID) {
				const c = Z.Collections.get(created.collectionID);
				if (c && !c.deleted) {
					await c.eraseTx();
				}
			}
			for (const p of created.files) {
				await IOUtils.remove(p, { ignoreAbsent: true }).catch(() => {});
			}
			return { annotations: annotationIDs.length, items: itemIDs.length, files: created.files.length };
		});
	}

	const report = { suite: "annotate-pdf-reversibility", steps };
	try {
		await Z.File.putContentsAsync(P("ap-exp-report.json"), JSON.stringify(report, null, 2));
	}
	catch (e) {
		// Ignore
	}
	if (typeof done === "function") {
		done(report);
	}
	return report;
})().then(null, (e) => {
	try {
		Zotero.File.putContentsAsync(
			PathUtils.join(PathUtils.tempDir, "ap-exp-report.json"),
			JSON.stringify({ fatal: String((e && e.stack) || e) })
		);
	}
	catch (e2) {
		// Ignore
	}
});
