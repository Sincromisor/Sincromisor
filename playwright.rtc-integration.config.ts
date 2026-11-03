import { defineConfig } from "@playwright/test";

import { browserTestUse } from "./playwright.browser";
import { rtcIntegrationEnv } from "./playwright.rtc-integration.env";

// Go試験が起動したサーバーと固定音声を使う。サービスの起動・終了はGo側が所有する。
export default defineConfig({
	globalSetup: "./playwright.rtc-integration.env.ts",
	testDir: "./sincromisor-frontend/tests/rtc-integration",
	timeout: 180_000,
	reporter: "line",
	workers: 1,
	use: {
		...browserTestUse,
		baseURL: rtcIntegrationEnv.baseURL,
		browserName: "chromium",
		headless: true,
		launchOptions: {
			...browserTestUse.launchOptions,
			args: [
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
				`--use-file-for-fake-audio-capture=${rtcIntegrationEnv.audioFixture}`,
			],
		},
		permissions: ["microphone"],
	},
});
