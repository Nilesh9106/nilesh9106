import { config } from "../../config";

export interface Project {
	title: string;
	summary: string;
	url: string;
	metric?: { value: string; label: string };
}

export interface Package {
	name: string;
	description: string;
	github?: string;
	npm?: string;
	downloads?: number;
	stars?: number;
}

export interface Post {
	title: string;
	url: string;
	date: Date;
}

export interface ContributionDay {
	date: string;
	count: number;
	level: 0 | 1 | 2 | 3 | 4;
}

async function get(url: string, init?: RequestInit): Promise<Response> {
	const res = await fetch(url, init);
	if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`);
	return res;
}

const text = async (url: string) => (await get(url)).text();

/** Lines of one "## Heading" section of a markdown document. */
function section(md: string, heading: string): string[] {
	const lines = md.split("\n");
	const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
	if (start === -1) return [];
	const out: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.startsWith("## ")) break;
		if (line.startsWith("- ")) out.push(line.slice(2));
	}
	return out;
}

export async function loadSite() {
	const llms = await text(`${config.site}/llms.txt`);
	const positioning = /^> (.+)$/m.exec(llms)?.[1] ?? "";

	const projects: Project[] = await Promise.all(
		section(llms, "Projects").map(async (line) => {
			const m = /^\[(.+?)\]\((.+?)\): (.+)$/.exec(line);
			if (!m) throw new Error(`Unexpected project line: ${line}`);
			const [, title, mdUrl, summary] = m;
			const md = await text(mdUrl);
			const url = /^URL: (\S+)/m.exec(md)?.[1] ?? mdUrl.replace(/\.md$/, "/");
			const first = section(md, "Numbers")[0];
			const metric = first && /^(.+?): (.+)$/.exec(first);
			return {
				title,
				summary,
				url,
				metric: metric ? { value: metric[1], label: metric[2] } : undefined,
			};
		}),
	);

	const packages: Package[] = section(llms, "Open source").map((line) => {
		const [, name, rest] = /^(.+?): (.+)$/.exec(line) ?? [];
		const github = /GitHub: (\S+?)\.?(?:\s|$)/.exec(rest)?.[1];
		const npm = /npm: (\S+?)\.?(?:\s|$)/.exec(rest)?.[1];
		const description = rest
			.replace(/\s*GitHub: .*$/, "")
			.split(/(?<=\.)\s/)[0];
		return { name, description, github, npm };
	});

	// Ask is only linked when it's switched on in the live build.
	const home = await text(`${config.site}/`);
	const askEnabled = home.includes("data-ask-open");

	return { positioning, projects, packages, askEnabled };
}

export async function loadPosts(): Promise<Post[]> {
	const rss = await text(`${config.site}/rss.xml`);
	const tag = (item: string, name: string) =>
		new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item)?.[1]?.trim() ?? "";
	return [...rss.matchAll(/<item>([\s\S]*?)<\/item>/g)]
		.map(([, item]) => ({
			title: decode(tag(item, "title")),
			url: tag(item, "link"),
			date: new Date(tag(item, "pubDate")),
		}))
		.sort((a, b) => b.date.getTime() - a.date.getTime())
		.slice(0, config.posts);
}

const decode = (s: string) =>
	s
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&");

const ghHeaders = (): HeadersInit => {
	const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	return {
		Accept: "application/vnd.github+json",
		"User-Agent": config.login,
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
};

export async function loadPackageStats(packages: Package[]) {
	return Promise.all(
		packages.map(async (p) => {
			const npmName = p.npm?.split("/package/")[1];
			const repo = p.github?.replace("https://github.com/", "");
			const [downloads, stars] = await Promise.all([
				npmName
					? get(`https://api.npmjs.org/downloads/point/last-month/${npmName}`)
							.then((r) => r.json() as Promise<{ downloads: number }>)
							.then((d) => d.downloads)
					: undefined,
				repo
					? get(`https://api.github.com/repos/${repo}`, {
							headers: ghHeaders(),
						})
							.then((r) => r.json() as Promise<{ stargazers_count: number }>)
							.then((d) => d.stargazers_count)
					: undefined,
			]);
			return { ...p, downloads, stars };
		}),
	);
}

const LEVELS = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
} as const;

/**
 * Last year of contributions. Needs a token; with a personal token (GH_TOKEN)
 * private contributions are counted too, if "private contributions" is on in the profile.
 */
export async function loadContributions() {
	const query = `query($login: String!) {
		user(login: $login) {
			contributionsCollection {
				contributionCalendar {
					totalContributions
					weeks { contributionDays { date contributionCount contributionLevel } }
				}
			}
		}
	}`;
	const res = await get("https://api.github.com/graphql", {
		method: "POST",
		headers: { ...ghHeaders(), "Content-Type": "application/json" },
		body: JSON.stringify({ query, variables: { login: config.login } }),
	});
	const json = (await res.json()) as {
		errors?: { message: string }[];
		data: {
			user: {
				contributionsCollection: {
					contributionCalendar: {
						totalContributions: number;
						weeks: {
							contributionDays: {
								date: string;
								contributionCount: number;
								contributionLevel: keyof typeof LEVELS;
							}[];
						}[];
					};
				};
			};
		};
	};
	if (json.errors)
		throw new Error(json.errors.map((e) => e.message).join("; "));
	const cal = json.data.user.contributionsCollection.contributionCalendar;
	return {
		total: cal.totalContributions,
		weeks: cal.weeks.map((w) =>
			w.contributionDays.map(
				(d): ContributionDay => ({
					date: d.date,
					count: d.contributionCount,
					level: LEVELS[d.contributionLevel],
				}),
			),
		),
	};
}
