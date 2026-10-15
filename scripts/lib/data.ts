import { config } from "../../config";

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

	return { positioning, packages, askEnabled };
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

/** POST a GraphQL query for `config.login`; throws on GraphQL errors. */
async function gql<T>(query: string): Promise<T> {
	const res = await get("https://api.github.com/graphql", {
		method: "POST",
		headers: { ...ghHeaders(), "Content-Type": "application/json" },
		body: JSON.stringify({ query, variables: { login: config.login } }),
	});
	const json = (await res.json()) as {
		errors?: { message: string }[];
		data: T;
	};
	if (json.errors)
		throw new Error(json.errors.map((e) => e.message).join("; "));
	return json.data;
}

export async function loadContributions() {
	const data = await gql<{
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
	}>(`query($login: String!) {
		user(login: $login) {
			contributionsCollection {
				contributionCalendar {
					totalContributions
					weeks { contributionDays { date contributionCount contributionLevel } }
				}
			}
		}
	}`);
	const cal = data.user.contributionsCollection.contributionCalendar;
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

export interface Language {
	name: string;
	share: number;
}

/** Language mix across your own public, non-fork repos, by bytes. Top few plus "Other". */
export async function loadLanguages(top = 5): Promise<Language[]> {
	const data = await gql<{
		user: {
			repositories: {
				nodes: {
					languages: { edges: { size: number; node: { name: string } }[] };
				}[];
			};
		};
	}>(`query($login: String!) {
		user(login: $login) {
			repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
				nodes { languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } }
			}
		}
	}`);
	const totals = new Map<string, number>();
	for (const repo of data.user.repositories.nodes)
		for (const { size, node } of repo.languages.edges)
			totals.set(node.name, (totals.get(node.name) ?? 0) + size);
	const all = [...totals].sort((a, b) => b[1] - a[1]);
	const sum = all.reduce((n, [, size]) => n + size, 0);
	if (!sum) return [];
	const langs = all
		.slice(0, top)
		.map(([name, size]) => ({ name, share: size / sum }));
	const rest = 1 - langs.reduce((n, l) => n + l.share, 0);
	if (rest > 0.005) langs.push({ name: "Other", share: rest });
	return langs;
}

const NOISE = /^(chore|ci|build|style|test|docs|refactor|release|wip)\b(\(.*?\))?!?:|^merge\b|^bump\b/i;

/** A readable commit title, or null for housekeeping commits and one-word messages. */
function commitTitle(headline: string): string | null {
	if (NOISE.test(headline)) return null;
	const title = headline.replace(/^(feat|fix|perf)(\(.*?\))?!?:\s*/i, "").trim();
	if (title.length < 12 || !title.includes(" ")) return null;
	return title[0].toUpperCase() + title.slice(1);
}

export interface ActivityItem {
	kind: "release" | "commit";
	repo: string;
	repoUrl: string;
	title: string;
	url: string;
	date: Date;
}

/**
 * Recent releases and your own commits in your most recently pushed public repos.
 * At most two items per repo, so one busy repo doesn't fill the list.
 */
export async function loadActivity(
	limit: number,
	exclude: string[],
): Promise<ActivityItem[]> {
	const data = await gql<{
		user: {
			repositories: {
				nodes: {
					name: string;
					url: string;
					releases: {
						nodes: {
							name: string | null;
							tagName: string;
							url: string;
							publishedAt: string | null;
							isDraft: boolean;
						}[];
					};
					defaultBranchRef: {
						target: {
							history?: {
								nodes: {
									messageHeadline: string;
									committedDate: string;
									url: string;
									author: { user: { login: string } | null };
								}[];
							};
						};
					} | null;
				}[];
			};
		};
	}>(`query($login: String!) {
		user(login: $login) {
			repositories(first: 8, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, orderBy: { field: PUSHED_AT, direction: DESC }) {
				nodes {
					name url
					releases(first: 2, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { name tagName url publishedAt isDraft } }
					defaultBranchRef { target { ... on Commit { history(first: 10) { nodes { messageHeadline committedDate url author { user { login } } } } } } }
				}
			}
		}
	}`);
	const skip = new Set(exclude.map((r) => r.toLowerCase()));
	const items: ActivityItem[] = [];
	for (const repo of data.user.repositories.nodes) {
		if (skip.has(repo.name.toLowerCase())) continue;
		const base = { repo: repo.name, repoUrl: repo.url };
		const own: ActivityItem[] = [];
		for (const r of repo.releases.nodes) {
			if (r.isDraft || !r.publishedAt) continue;
			own.push({
				...base,
				kind: "release",
				title: r.tagName,
				url: r.url,
				date: new Date(r.publishedAt),
			});
		}
		for (const c of repo.defaultBranchRef?.target.history?.nodes ?? []) {
			if (c.author.user?.login.toLowerCase() !== config.login.toLowerCase())
				continue;
			const title = commitTitle(c.messageHeadline);
			if (!title) continue;
			own.push({
				...base,
				kind: "commit",
				title,
				url: c.url,
				date: new Date(c.committedDate),
			});
		}
		items.push(
			...own.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 2),
		);
	}
	return items
		.sort((a, b) => b.date.getTime() - a.date.getTime())
		.slice(0, limit);
}
