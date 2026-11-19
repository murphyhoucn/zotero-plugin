/*
 * Window-scope file channel — a dev helper for driving Zotero from a shell when
 * the plugin's own dev channel isn't installed yet.
 *
 * Usage: open Tools -> Developer -> Run JavaScript in Zotero and run:
 *
 *   eval(Zotero.File.getContents(PathUtils.join(PathUtils.tempDir,"ap-boot.js")))
 *
 * Afterwards every command written to <temp>/ap-cmd.js is evaluated in the main
 * window scope (async) every 1.5 s; the result is written to <temp>/ap-out.txt.
 * This works with the *release* build of the plugin too, because the plugin
 * exposes `Zotero.AnnotatePDF`.
 */
(function () {
	const T = PathUtils.tempDir;
	const CMD = PathUtils.join(T, "ap-cmd.js");
	const OUT = PathUtils.join(T, "ap-out.txt");
	const MARKER = PathUtils.join(T, "ap-boot-started.txt");

	let busy = false;
	const write = (path, text) => Zotero.File.putContentsAsync(path, text).catch(() => {});

	function tick() {
		if (busy) {
			return;
		}
		(async () => {
			busy = true;
			try {
				if (await IOUtils.exists(CMD)) {
					const src = await Zotero.File.getContentsAsync(CMD);
					await IOUtils.remove(CMD, { ignoreAbsent: true });
					write(OUT, "running " + new Date().toISOString() + "\n");
					try {
						const result = await Zotero.getMainWindow().eval(
							"(async function(){\n" + src + "\n})()"
						);
						let text;
						try {
							text = JSON.stringify(result, null, 2);
						}
						catch (e) {
							text = String(result);
						}
						write(OUT, "RESULT " + new Date().toISOString() + "\n" + text);
					}
					catch (e) {
						write(OUT, "ERROR " + new Date().toISOString() + "\n"
							+ ((e && (e.stack || e.message)) || String(e)));
					}
				}
			}
			catch (e) {
				// Ignore
			}
			finally {
				busy = false;
			}
		})();
	}

	const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
	timer.initWithCallback(tick, 1500, Ci.nsITimer.TYPE_REPEATING_SLACK);

	write(MARKER, "started " + new Date().toISOString());
	Zotero.debug("[annotate-pdf-boot] window-scope channel started");
	return "channel-started";
})()
