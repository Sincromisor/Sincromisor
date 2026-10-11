import { defineConfig } from "@playwright/test";

const chromiumBinary = process.env.SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY;
if (!chromiumBinary) {
	throw new Error("SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY is required.");
}

// Go試験が起動したサーバーと固定音声を使う。サービスの起動・終了はGo側が所有する。
export default defineConfig({
	testDir: "./sincromisor-frontend/tests/rtc-integration",
	timeout: 180_000,
	reporter: "line",
	workers: 1,
	use: {
		baseURL: process.env.SINCRO_RTC_INTEGRATION_BASE_URL,
		browserName: "chromium",
		headless: true,
		launchOptions: {
			executablePath: chromiumBinary,
			args: [
				"--use-fake-device-for-media-stream",
				"--use-fake-ui-for-media-stream",
				`--use-file-for-fake-audio-capture=${process.env.SINCRO_RTC_INTEGRATION_AUDIO_FIXTURE}`,
			],
		},
		permissions: ["microphone"],
	},
});
