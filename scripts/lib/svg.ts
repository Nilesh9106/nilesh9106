import type { ContributionDay, Language } from "./data";
import { ditherField, levelDefs } from "./dither";
import { MONO, SANS, type Theme } from "./theme";

export const esc = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** Greedy wrap by an approximate average glyph width; the last line gets an ellipsis. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
	const lines: string[] = [];
	let line = "";
	for (const word of text.split(/\s+/)) {
		if (line && (line + " " + word).length > maxChars) {
			lines.push(line);
			line = word;
		} else line = line ? `${line} ${word}` : word;
	}
	if (line) lines.push(line);
	if (lines.length > maxLines) {
		const kept = lines.slice(0, maxLines);
		kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s,.;:]+\S*$/, "")}…`;
		return kept;
	}
	return lines;
}

const svg = (w: number, h: number, title: string, body: string) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</svg>\n`;

export function header(
	t: Theme,
	d: {
		name: string;
		role: string;
		positioning: string;
		now: string;
		site: string;
	},
) {
	const W = 1200;
	const H = 300;
	const dot = 4;
	const nowLines = wrap(`Now: ${d.now}`, 92, 2);
	const defs = `<defs>${levelDefs("i", dot, t.ink, t.name === "light" ? 0.22 : 0.2)}${levelDefs("a", dot, t.primary, 0.75)}</defs>`;
	// Keep the field off the text on the left.
	const field = ditherField({
		id: "i",
		accentId: "a",
		x: 0,
		y: 0,
		width: W,
		height: H,
		dot,
		mask: (fx) => Math.min(1, Math.max(0, (fx - 0.4) / 0.3)),
	});
	const body = `${defs}
<rect width="${W}" height="${H}" fill="${t.background}"/>
<g>${field}</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="none" stroke="${t.border}"/>
<g font-family="${SANS}">
<text x="48" y="64" font-family="${MONO}" font-size="15" fill="${t.muted}">${esc(d.site.replace(/^https?:\/\//, ""))}</text>
<rect x="48" y="96" width="10" height="10" fill="${t.primary}"><animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite"/></rect>
<text x="70" y="108" font-family="${MONO}" font-size="15" fill="${t.muted}">${esc(d.role)}</text>
<text x="46" y="170" font-size="56" font-weight="600" letter-spacing="-1.5" fill="${t.foreground}">${esc(d.name)}</text>
<text x="48" y="208" font-size="20" fill="${t.foreground}">${esc(d.positioning)}</text>
${nowLines.map((l, i) => `<text x="48" y="${246 + i * 22}" font-size="15" fill="${t.muted}">${esc(l)}</text>`).join("")}
</g>`;
	return svg(W, H, `${d.name}: ${d.positioning}`, body);
}

export function contributions(
	t: Theme,
	d: { total: number; weeks: ContributionDay[][] },
	languages: Language[] = [],
) {
	const dot = 3;
	const size = dot * 4;
	const step = size + 3;
	const left = 32;
	const top = 44;
	const W = left * 2 + d.weeks.length * step - 3;
	const calendarH = top + 7 * step + 34;
	const H = languages.length ? calendarH + 74 : calendarH;
	// Contribution levels 1-4 map to dither densities; the busiest days use the accent.
	const density = [1, 4, 8, 12, 16];
	const defs = `<defs>${levelDefs("i", dot, t.ink, 0.7)}${levelDefs("a", dot, t.primary, 1)}</defs>`;
	const cell = (level: number, x: number, y: number) =>
		level === 0
			? `<use href="#i1" x="${x}" y="${y}" opacity="0.4"/>`
			: `<use href="#${level === 4 ? "a" : "i"}${density[level]}" x="${x}" y="${y}"/>`;

	let cells = "";
	d.weeks.forEach((week, wi) => {
		for (const day of week) {
			const dow = new Date(`${day.date}T00:00:00Z`).getUTCDay();
			cells += cell(day.level, left + wi * step, top + dow * step);
		}
	});

	const months: string[] = [];
	let last = -1;
	d.weeks.forEach((week, wi) => {
		const m = new Date(`${week[0].date}T00:00:00Z`).getUTCMonth();
		if (m !== last && wi < d.weeks.length - 2) {
			if (last !== -1 || week[0].date.endsWith("-01") || wi === 0)
				months.push(
					`<text x="${left + wi * step}" y="${top - 10}">${new Date(Date.UTC(2000, m)).toLocaleString("en", { month: "short" })}</text>`,
				);
			last = m;
		}
	});

	const legendX = W - left - 5 * step - 70;
	const legendY = top + 7 * step + 10;
	const legend = [0, 1, 2, 3, 4]
		.map((l, i) => cell(l, legendX + 34 + i * step, legendY))
		.join("");

	// Language mix: one dithered bar, each language a different density.
	const langDensity = [16, 16, 11, 7, 4, 2];
	const langCell = (i: number, x: number, y: number) =>
		`<use href="#${i === 0 ? "a" : "i"}${langDensity[Math.min(i, langDensity.length - 1)]}" x="${x}" y="${y}"/>`;
	let langBar = "";
	let langLegend = "";
	if (languages.length) {
		const barY = calendarH + 14;
		const cols = Math.floor((W - left * 2 + 3) / step);
		// Largest-remainder split of the columns, so the bar always fills exactly.
		const raw = languages.map((l) => l.share * cols);
		const widths = raw.map(Math.floor);
		const order = raw
			.map((r, i) => [r - Math.floor(r), i] as const)
			.sort((a, b) => b[0] - a[0]);
		for (let k = 0; k < cols - widths.reduce((a, b) => a + b, 0); k++)
			widths[order[k % order.length][1]]++;
		let col = 0;
		widths.forEach((w, i) => {
			for (let c = 0; c < w; c++)
				langBar += langCell(i, left + (col + c) * step, barY);
			col += w;
		});
		let x = left;
		const legendRow = barY + 30;
		languages.forEach((l, i) => {
			const label = `${l.name} ${Math.round(l.share * 100)}%`;
			langLegend += `${langCell(i, x, legendRow - 10)}<text x="${x + size + 6}" y="${legendRow}">${esc(label)}</text>`;
			x += size + 6 + label.length * 6.7 + 18;
		});
	}

	const body = `${defs}
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="${t.background}" stroke="${t.border}"/>
<g font-family="${MONO}" font-size="11" fill="${t.muted}">${months.join("")}
<text x="${left}" y="${legendY + 10}">${d.total.toLocaleString("en")} contributions in the last year</text>
<text x="${legendX}" y="${legendY + 10}">Less</text>
<text x="${legendX + 34 + 5 * step + 4}" y="${legendY + 10}">More</text>
${langLegend}
</g>
<g>${cells}${legend}${langBar}</g>`;
	return svg(W, H, `${d.total} contributions in the last year`, body);
}
