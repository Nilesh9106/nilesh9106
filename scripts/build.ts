// Regenerates README.md and assets/*.svg from nileshdarji.dev and the GitHub API.
// Run: bun run build (set GH_TOKEN for private contributions).
import { mkdir } from "node:fs/promises";
import { config } from "../config";
import {
	loadContributions,
	loadPackageStats,
	loadPosts,
	loadSite,
} from "./lib/data";
import { contributions, header, projectCard } from "./lib/svg";
import { themes } from "./lib/theme";

const root = new URL("..", import.meta.url).pathname;
const asset = (name: string) => `assets/${name}`;

const [site, posts, contrib] = await Promise.all([
	loadSite(),
	loadPosts(),
	loadContributions(),
]);
const packages = await loadPackageStats(site.packages);

const slug = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

await mkdir(`${root}assets`, { recursive: true });
const files: Record<string, string> = {};
for (const t of themes) {
	files[asset(`header-${t.name}.svg`)] = header(t, {
		name: config.name,
		role: config.role,
		positioning: site.positioning,
		now: config.now,
		site: config.site,
	});
	site.projects.forEach((p, i) => {
		files[asset(`project-${slug(p.title)}-${t.name}.svg`)] = projectCard(
			t,
			p,
			i,
		);
	});
	files[asset(`contributions-${t.name}.svg`)] = contributions(t, contrib);
}

/** <picture> that follows GitHub's light/dark theme. */
const picture = (base: string, alt: string, width?: string) =>
	`<picture><source media="(prefers-color-scheme: dark)" srcset="./assets/${base}-dark.svg"><img src="./assets/${base}-light.svg" alt="${alt.replace(/"/g, "&quot;")}"${width ? ` width="${width}"` : ""}></picture>`;

const fmt = (n: number) => n.toLocaleString("en");
const date = (d: Date) =>
	d.toLocaleDateString("en", {
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});

const blocks: Record<string, string> = {
	header: `<a href="${config.site}">${picture("header", `${config.name}: ${site.positioning}`, "100%")}</a>`,
	links: config.links
		.map((l) => `<a href="${l.href}">${l.label}</a>`)
		.join(" · "),
	projects: site.projects
		.map(
			(p) =>
				`<a href="${p.url}">${picture(`project-${slug(p.title)}`, `${p.title}: ${p.summary}`, "400")}</a>`,
		)
		// GitHub turns line breaks into <br>, so keep each row of two on one line.
		.reduce<string[]>((rows, card, i) => {
			if (i % 2 === 0) rows.push(card);
			else rows[rows.length - 1] += ` ${card}`;
			return rows;
		}, [])
		.join("\n"),
	opensource: packages
		.map((p) => {
			const stats = [
				p.downloads !== undefined &&
					`${fmt(p.downloads)} npm downloads last month`,
				p.stars && `${fmt(p.stars)} ★`,
			]
				.filter(Boolean)
				.join(" · ");
			const link = p.github ?? p.npm;
			return `- [**${p.name}**](${link}): ${p.description}${stats ? `<br><sub>${stats}</sub>` : ""}`;
		})
		.join("\n"),
	writing: posts
		.map((p) => `- [${p.title}](${p.url}) <sub>${date(p.date)}</sub>`)
		.join("\n"),
	contributions: picture(
		"contributions",
		`${fmt(contrib.total)} contributions in the last year`,
		"100%",
	),
	ask: site.askEnabled
		? `Questions about my work? [**Ask the AI on my site →**](${config.site}/#ask) It answers only from my projects and posts, with sources.\n\nOr give your own agent the context:`
		: "Give your own agent the context on my work:",
	site: config.site,
};

const template = await Bun.file(`${root}README.template.md`).text();
files["README.md"] = template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
	if (!(key in blocks)) throw new Error(`Unknown template block ${m}`);
	return blocks[key];
});

let changed = 0;
for (const [name, content] of Object.entries(files)) {
	const file = Bun.file(`${root}${name}`);
	if ((await file.exists()) && (await file.text()) === content) continue;
	await Bun.write(file, content);
	changed++;
	console.log(`wrote ${name}`);
}
console.log(changed ? `${changed} file(s) updated` : "No changes");
