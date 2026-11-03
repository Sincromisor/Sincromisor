import { defineConfig } from "@playwright/test";

import { browserTestUse } from "./playwright.browser";

// CSSとRTCは専用サーバーを所有する設定から実行し、通常の画面試験には混ぜない。
export default defineConfig({
	testDir: "./sincromisor-frontend/tests",
	testIgnore: ["**/styles/**", "**/rtc-integration/**"],
	outputDir: "./work.agents/browser-test-results",
	globalSetup: "./playwright.browser.ts",
	use: browserTestUse,
});
