// 4×4 Bayer ordered dithering, as in the portfolio's side panel. Each 4×4 block is
// drawn as one <use> of a pre-built level shape, which keeps the SVGs small.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** <path> defs `${id}1`..`${id}16`: level n lights the n cells with the lowest thresholds. */
export function levelDefs(id: string, dot: number, fill: string, opacity = 1) {
	let out = "";
	for (let n = 1; n <= 16; n++) {
		let d = "";
		for (let i = 0; i < 16; i++) {
			if (BAYER[i] >= n) continue;
			const x = (i % 4) * dot;
			const y = Math.floor(i / 4) * dot;
			d += `M${x} ${y}h${dot}v${dot}h-${dot}z`;
		}
		out += `<path id="${id}${n}" d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`;
	}
	return out;
}

/** Map a 0..1 intensity to a level 0..16. */
export const toLevel = (v: number) =>
	Math.max(0, Math.min(16, Math.round(v * 16)));

/**
 * The site's field: diagonal streams, densest toward the bottom right.
 * `x`, `y` are in cells; `w`, `h` the field size in cells.
 */
export function field(
	x: number,
	y: number,
	w: number,
	h: number,
	s = 0.8,
	fade = true,
) {
	const u = x * 0.035 - y * 0.02;
	const v =
		(Math.sin(u + s) +
			Math.sin(y * 0.028 - s * 1.2) +
			Math.sin((x + y) * 0.018 + s * 0.6)) /
			6 +
		0.5;
	if (!fade) return v;
	return v * ((x / w) * 0.55 + (y / h) * 0.45) ** 1.4;
}

/** A dithered field over a box, as <use> elements referencing `levelDefs` ids. */
export function ditherField(opts: {
	id: string;
	accentId: string;
	x: number;
	y: number;
	width: number;
	height: number;
	dot: number;
	/** Shifts the pattern so each image looks a little different. */
	seed?: number;
	/** Extra fade factor by position (0..1), e.g. to keep text areas clear. */
	mask?: (fx: number, fy: number) => number;
	/** Use only `mask` for the overall shape, not the site's bottom-right fade. */
	fade?: boolean;
}) {
	const block = opts.dot * 4;
	const cols = Math.ceil(opts.width / block);
	const rows = Math.ceil(opts.height / block);
	let out = "";
	for (let by = 0; by < rows; by++) {
		for (let bx = 0; bx < cols; bx++) {
			const cx = bx * 4 + 2;
			const cy = by * 4 + 2;
			let v = field(cx, cy, cols * 4, rows * 4, opts.seed ?? 0.8, opts.fade);
			if (opts.mask) v *= opts.mask(bx / cols, by / rows);
			// Same cut-off as the site: cells light when level > threshold + 0.2.
			const n = toLevel((v - 0.2) / 0.8);
			if (n === 0) continue;
			const px = opts.x + bx * block;
			const py = opts.y + by * block;
			out += `<use href="#${opts.id}${n}" x="${px}" y="${py}"/>`;
			// Like the site, only the brightest cells pick up the accent colour.
			if (v > 0.6)
				out += `<use href="#${opts.accentId}${Math.min(n, 2)}" x="${px}" y="${py}"/>`;
		}
	}
	return out;
}
