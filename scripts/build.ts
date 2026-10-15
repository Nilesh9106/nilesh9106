// Regenerates README.md and assets/*.svg from nileshdarji.dev and the GitHub API.
// Run: bun run build (set GH_TOKEN for private contributions).
import { mkdir } from "node:fs/promises";
import { config } from "../config";
import {
	loadActivity,
	loadContributions,
	loadLanguages,
	loadPackageStats,
	loadPosts,
	loadSite,
} from "./lib/data";
import { contributions, header } from "./lib/svg";
import { themes } from "./lib/theme";

const root = new URL("..", import.meta.url).pathname;
const asset = (name: string) => `assets/${name}`;

const [site, posts, contrib, languages, activity] = await Promise.all([
	loadSite(),
	loadPosts(),
	loadContributions(),
	loadLanguages(),
	loadActivity(config.activity, config.activityExclude),
]);
const packages = await loadPackageStats(site.packages);

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
	files[asset(`contributions-${t.name}.svg`)] = contributions(
		t,
		contrib,
		languages,
	);
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

const day = (d: Date) =>
	d.toLocaleDateString("en", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	});

const blocks: Record<string, string> = {
	header: `<a href="${config.site}">${picture("header", `${config.name}: ${site.positioning}`, "100%")}</a>`,
	links: config.links
		.map((l) => `<a href="${l.href}">${l.label}</a>`)
		.join(" · "),
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
	// Heading included, so the section disappears when there's nothing recent.
	lately: activity.length
		? `## Lately\n\n${activity
				.map((a) =>
					a.kind === "release"
						? `- Released [**${a.repo} ${a.title}**](${a.url}) <sub>${day(a.date)}</sub>`
						: `- [${a.repo}](${a.repoUrl}): [${a.title.replace(/([[\]])/g, "\\$1")}](${a.url}) <sub>${day(a.date)}</sub>`,
				)
				.join("\n")}\n`
		: "",
	contributions: picture(
		"contributions",
		`${fmt(contrib.total)} contributions in the last year. Languages: ${languages.map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(", ")}`,
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
