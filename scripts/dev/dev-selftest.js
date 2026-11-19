/*
 * Dev-only self-test channel for the Annotate PDF plugin.
 *
 * NOT part of the release XPI — scripts/dev/build-dev.sh injects this file as
 * chrome/content/dev-selftest.js into the dev build only.
 *
 * Protocol (file-based, so tests can be driven from a shell while Zotero runs):
 *   - Write a job script to  <temp>/annotate-pdf-job.js
 *   - The channel polls for it and loads it with `AnnotatePDF`, `Zotero`,
 *     `Services`, `IOUtils`, `PathUtils`, `Cc`, `Ci`, `Components`, `delay`,
 *     `done` and `fail` in scope.
 *   - The job must call `done(result)` when finished (top-level `await` is not
 *     available in a classic script):
 *
 *       (async () => {
 *         const items = AnnotatePDF.selectedPDFAttachments();
 *         done({ count: items.length });
 *       })().then(null, e => done({ error: String(e && e.stack || e) }));
 *
 *   - The result is written to <temp>/annotate-pdf-result.json
 *
 * Timers use nsITimer because `setInterval` cannot be called on a plain scope
 * object (it requires a real Window).
 */

const TEMP_DIR = PathUtils.tempDir;
const JOB_PATH = PathUtils.join(TEMP_DIR, "annotate-pdf-job.js");
const RESULT_PATH = PathUtils.join(TEMP_DIR, "annotate-pdf-result.json");
const CHANNEL_MARKER = PathUtils.join(TEMP_DIR, "annotate-pdf-channel.txt");
const POLL_MS = 1200;
const JOB_TIMEOUT_MS = 120000;

let activeJob = false;
let jobStartedAt = 0;
let jobTimer = null;
let pollTimer = null;

function makeOnceTimer(ms, cb) {
	const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
	timer.initWithCallback(cb, ms, Ci.nsITimer.TYPE_ONE_SHOT);
	return timer;
}

function delay(ms) {
	return new Promise((resolve) => makeOnceTimer(ms, resolve));
}

function jobUrlFor(path) {
	return Services.io.newFileURI(Zotero.File.pathToFile(path)).spec;
}

function loadScript(url, scope) {
	const loader = Services.scriptloader;
	if (typeof loader.loadSubScriptWithOptions === "function") {
		loader.loadSubScriptWithOptions(url, { target: scope, charset: "UTF-8", cache: false });
		return;
	}
	loader.loadSubScript(url, scope, "UTF-8");
}

async function writeResult(result) {
	try {
		const payload = Object.assign({ ts: Date.now() }, result);
		const text = JSON.stringify(payload, null, 2);
		await Zotero.File.putContentsAsync(RESULT_PATH, text);
		Zotero.debug("[annotate-pdf-selftest] result: " + text.slice(0, 4000));
	}
	catch (e) {
		try {
			Zotero.logError(e);
		}
		catch (e2) {
			// Ignore
		}
	}
}

function finishJob(result) {
	if (jobTimer) {
		jobTimer.cancel();
		jobTimer = null;
	}
	activeJob = false;
	writeResult(result);
}

async function poll() {
	if (activeJob) {
		// Self-heal: a job that never called done() (e.g. interrupted by a
		// modal dialog) must not block the channel forever.
		if (Date.now() - jobStartedAt > JOB_TIMEOUT_MS + 10000) {
			Zotero.debug("[annotate-pdf-selftest] resetting stuck job");
			if (jobTimer) {
				jobTimer.cancel();
				jobTimer = null;
			}
			activeJob = false;
		}
		else {
			return;
		}
	}
	if (!(await IOUtils.exists(JOB_PATH))) {
		return;
	}
	activeJob = true;
	jobStartedAt = Date.now();
	jobTimer = makeOnceTimer(JOB_TIMEOUT_MS, () => {
		finishJob({ error: "job timed out after " + JOB_TIMEOUT_MS + " ms" });
	});

	const scope = {
		AnnotatePDF,
		Zotero,
		Services,
		IOUtils,
		PathUtils,
		Cc,
		Ci,
		Components,
		ChromeUtils,
		delay,
		loadScript,
		done: (result) => finishJob(result || { ok: true }),
		fail: (e) => finishJob({ error: (e && (e.stack || e.message)) || String(e) }),
	};

	// Load the job from a unique copy: the script loader caches by URL, so
	// loading the same job path twice would execute the first job's code again.
	const uniquePath = JOB_PATH + "." + Date.now() + ".js";
	try {
		await IOUtils.copy(JOB_PATH, uniquePath);
		try {
			loadScript(jobUrlFor(uniquePath), scope);
		}
		catch (e) {
			finishJob({ error: "job threw: " + ((e && (e.stack || e.message)) || String(e)) });
		}
	}
	catch (e) {
		finishJob({ error: "job copy failed: " + ((e && (e.stack || e.message)) || String(e)) });
	}
	finally {
		await IOUtils.remove(JOB_PATH, { ignoreAbsent: true }).catch(() => {});
		await IOUtils.remove(uniquePath, { ignoreAbsent: true }).catch(() => {});
	}
}

pollTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
pollTimer.initWithCallback(() => {
	poll().catch((e) => {
		try {
			Zotero.logError(e);
		}
		catch (e2) {
			// Ignore
		}
	});
}, POLL_MS, Ci.nsITimer.TYPE_REPEATING_SLACK);

Zotero.File.putContentsAsync(CHANNEL_MARKER, "started " + new Date().toISOString())
	.catch(() => {});
Zotero.debug("[annotate-pdf-selftest] dev channel started; job file: " + JOB_PATH);

registerCleanup(() => {
	if (pollTimer) {
		pollTimer.cancel();
		pollTimer = null;
	}
	if (jobTimer) {
		jobTimer.cancel();
		jobTimer = null;
	}
	try {
		IOUtils.remove(JOB_PATH, { ignoreAbsent: true });
	}
	catch (e) {
		// Ignore
	}
});
