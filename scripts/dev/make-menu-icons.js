/*
 * Generate the menu icons for the Annotate PDF plugin (PNG, 32x32, light/dark).
 *
 * Zotero's item context menu reserves a 16x16 icon area. An SVG using
 * `fill="context-fill"` renders as an empty box there (the context properties
 * are not resolved for plugin menu icons), while PNGs always render — that is
 * what other plugins (e.g. Zotero PDF Translate) ship. This script draws the
 * same glyph as chrome/content/icons/menu.svg (a page with two highlighted
 * lines) without any dependency.
 *
 * Usage: node scripts/dev/make-menu-icons.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const S = 4;      // supersampling factor (anti-aliasing)
const SIZE = 32;  // final size in px (the menu scales it to 16)
const W = SIZE * S;
const H = SIZE * S;

const PX = (c, x, y) => (y * W + x) * 4;

function insidePoly(x, y, pts) {
	let inside = false;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
		const [xi, yi] = pts[i];
		const [xj, yj] = pts[j];
		if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

function fillPoly(canvas, pts, color, alpha) {
	const scaled = pts.map(([x, y]) => [x * S, y * S]);
	const xs = scaled.map((p) => p[0]);
	const ys = scaled.map((p) => p[1]);
	const x0 = Math.max(0, Math.floor(Math.min(...xs)));
	const x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)));
	const y0 = Math.max(0, Math.floor(Math.min(...ys)));
	const y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) {
			if (!insidePoly(x + 0.5, y + 0.5, scaled)) {
				continue;
			}
			const i = PX(canvas, x, y);
			canvas[i] = color[0];
			canvas[i + 1] = color[1];
			canvas[i + 2] = color[2];
			canvas[i + 3] = alpha;
		}
	}
}

function downsample(canvas) {
	const out = new Uint8Array(SIZE * SIZE * 4);
	const n = S * S;
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let dy = 0; dy < S; dy++) {
				for (let dx = 0; dx < S; dx++) {
					const i = PX(canvas, x * S + dx, y * S + dy);
					const pa = canvas[i + 3] / 255;
					r += canvas[i] * pa;
					g += canvas[i + 1] * pa;
					b += canvas[i + 2] * pa;
					a += canvas[i + 3];
				}
			}
			const af = a / n / 255;
			const o = (y * SIZE + x) * 4;
			out[o] = af > 0 ? Math.round(r / n / af) : 0;
			out[o + 1] = af > 0 ? Math.round(g / n / af) : 0;
			out[o + 2] = af > 0 ? Math.round(b / n / af) : 0;
			out[o + 3] = Math.round(a / n);
		}
	}
	return out;
}

/* ---------- minimal PNG writer (RGBA8, no filtering) ---------- */

function crc32(buf) {
	let crc = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		let c = (crc ^ buf[i]) & 0xff;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		crc = (crc >>> 8) ^ c;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, w, h) {
	const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;   // bit depth
	ihdr[9] = 6;   // color type: RGBA
	const stride = w * 4 + 1;
	const raw = Buffer.alloc(stride * h);
	for (let y = 0; y < h; y++) {
		raw[y * stride] = 0; // filter: none
		Buffer.from(pixels.buffer, y * w * 4, w * 4).copy(raw, y * stride + 1);
	}
	return Buffer.concat([
		sig,
		chunk("IHDR", ihdr),
		chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

/* ---------- the glyph (same design as menu.svg) ---------- */

const PAGE = [[6, 2], [18.8, 2], [26, 9.2], [26, 30], [6, 30]];
const BAR1 = [[9.2, 14.8], [22.8, 14.8], [22.8, 18], [9.2, 18]];
const BAR2 = [[9.2, 20.6], [18.4, 20.6], [18.4, 23.6], [9.2, 23.6]];
const YELLOW = [255, 212, 0];

function makeIcon(pageColor) {
	const canvas = new Uint8Array(W * H * 4);
	fillPoly(canvas, PAGE, pageColor, 240);
	fillPoly(canvas, BAR1, YELLOW, 255);
	fillPoly(canvas, BAR2, YELLOW, 255);
	return encodePng(downsample(canvas), SIZE, SIZE);
}

const outDir = path.join(__dirname, "..", "..", "plugins", "annotate-pdf", "chrome", "content", "icons");
const files = {
	"menu-light.png": makeIcon([46, 58, 89]),      // dark slate page, for light menus
	"menu-dark.png": makeIcon([232, 236, 245]),    // light page, for dark menus
};
for (const [name, data] of Object.entries(files)) {
	const p = path.join(outDir, name);
	fs.writeFileSync(p, data);
	console.log("wrote", p, data.length, "bytes");
}
