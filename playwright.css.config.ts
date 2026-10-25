import { defineConfig } from "@playwright/test";

// CSSの挿入順と配信形態で優先順位が変わらないことを、同じ実ページで確認する。
// この設定が専用ポートのサーバーを起動・終了し、既存サービスは再利用しない。
export default defineConfig({
	testDir: "./sincromisor-frontend/tests/styles",
	outputDir: "./work/css-test-results",
	reporter: "line",
	workers: 1,
	use: { channel: "chrome", reducedMotion: "reduce" },
	projects: [
		{ name: "開発", use: { baseURL: "http://127.0.0.1:5175" } },
		{ name: "本番", use: { baseURL: "http://127.0.0.1:5176" } },
	],
	webServer: [
		{
			command: "npm run dev -- --host 127.0.0.1 --port 5175 --strictPort",
			wait: { stdout: /http:\/\/127\.0\.0\.1:5175\// },
			env: { BROWSER: "none" },
		},
		{
			command:
				"npm run build && npm --prefix sincromisor-frontend run preview -- --host 127.0.0.1 --port 5176 --strictPort",
			wait: { stdout: /http:\/\/127\.0\.0\.1:5176\// },
		},
	],
});
