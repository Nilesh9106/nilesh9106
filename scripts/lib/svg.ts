import type { ContributionDay, Project } from "./data";
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

export function projectCard(t: Theme, p: Project, index: number) {
	const W = 420;
	const H = 176;
	const dot = 3;
	const summary = wrap(p.summary, 58, 3);
	const defs = `<defs>${levelDefs("i", dot, t.ink, 0.22)}${levelDefs("a", dot, t.primary, 0.75)}</defs>`;
	const field = ditherField({
		id: "i",
		accentId: "a",
		x: W - 192,
		y: 0,
		width: 192,
		height: 48,
		dot,
		seed: 0.8 + index * 1.7,
		fade: false,
		mask: (fx, fy) => 1.5 * (fx * 0.6 + (1 - fy) * 0.4) ** 1.5,
	});
	const metric = p.metric
		? `<text x="22" y="148" font-size="26" font-weight="600" letter-spacing="-0.5" fill="${t.foreground}">${esc(p.metric.value)}</text>
<text x="22" y="164" font-size="12" fill="${t.muted}">${esc(p.metric.label)}</text>`
		: "";
	const body = `${defs}
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="${t.background}" stroke="${t.border}"/>
<g>${field}</g>
<g font-family="${SANS}">
<rect x="22" y="27" width="7" height="7" fill="${t.primary}"/>
<text x="37" y="35" font-size="16" font-weight="600" fill="${t.foreground}">${esc(p.title)}</text>
${summary.map((l, i) => `<text x="22" y="${62 + i * 18}" font-size="13" fill="${t.muted}">${esc(l)}</text>`).join("")}
${metric}
<text x="${W - 22}" y="164" text-anchor="end" font-family="${MONO}" font-size="12" fill="${t.muted}">Read →</text>
</g>`;
	return svg(W, H, `${p.title}: ${p.summary}`, body);
}

export function contributions(
	t: Theme,
	d: { total: number; weeks: ContributionDay[][] },
) {
	const dot = 3;
	const size = dot * 4;
	const step = size + 3;
	const left = 32;
	const top = 44;
	const W = left * 2 + d.weeks.length * step - 3;
	const H = top + 7 * step + 34;
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

	const body = `${defs}
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="2" fill="${t.background}" stroke="${t.border}"/>
<g font-family="${MONO}" font-size="11" fill="${t.muted}">${months.join("")}
<text x="${left}" y="${legendY + 10}">${d.total.toLocaleString("en")} contributions in the last year</text>
<text x="${legendX}" y="${legendY + 10}">Less</text>
<text x="${legendX + 34 + 5 * step + 4}" y="${legendY + 10}">More</text>
</g>
<g>${cells}${legend}</g>`;
	return svg(W, H, `${d.total} contributions in the last year`, body);
}
