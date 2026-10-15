// Same tokens as the portfolio (src/styles/global.css).
export interface Theme {
	name: "light" | "dark";
	background: string;
	panel: string;
	foreground: string;
	muted: string;
	border: string;
	primary: string;
	ink: string;
}

export const themes: Theme[] = [
	{
		name: "light",
		background: "#ffffff",
		panel: "#f4f4f5",
		foreground: "#18181b",
		muted: "#5c5c64",
		border: "#e4e4e7",
		primary: "#c2410c",
		ink: "#18181b",
	},
	{
		name: "dark",
		background: "#0d1117",
		panel: "#131316",
		foreground: "#ececee",
		muted: "#a8a8b0",
		border: "#26262b",
		primary: "#fb923c",
		ink: "#ececee",
	},
];

export const SANS =
	"-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
export const MONO =
	"ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
