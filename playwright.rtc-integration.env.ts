import type { FullConfig } from "@playwright/test";

import verifyBrowser from "./playwright.browser";

/** Go試験から渡される実行環境。読み込み時には検証せず、エディターからの一覧取得を許可する。 */
export const rtcIntegrationEnv = {
	chromiumBinary: process.env.SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY,
	baseURL: process.env.SINCRO_RTC_INTEGRATION_BASE_URL,
	audioFixture: process.env.SINCRO_RTC_INTEGRATION_AUDIO_FIXTURE,
};

/**
 * PlaywrightのglobalSetupとして実行し、ブラウザー起動前に必須入力を検査する。
 * 一覧取得では呼ばれない。ファイルの存在検査とサービス起動はGo側、ブラウザーの版と保護設定は共通検査が所有する。
 */
export default async function validateRtcIntegrationEnvironment(
	config: FullConfig,
): Promise<void> {
	const required = {
		SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY: rtcIntegrationEnv.chromiumBinary,
		SINCRO_RTC_INTEGRATION_BASE_URL: rtcIntegrationEnv.baseURL,
		SINCRO_RTC_INTEGRATION_AUDIO_FIXTURE: rtcIntegrationEnv.audioFixture,
	};
	const missing = Object.entries(required)
		.filter(([, value]) => !value?.trim())
		.map(([name]) => name);
	if (missing.length > 0) {
		throw new Error(
			`Missing RTC integration environment: ${missing.join(", ")}. ` +
				"Run from sincromisor-server/sincro-rtc: " +
				"go test -tags=rtcintegration ./internal/rtcintegration/browser " +
				"-run '^TestFrontendBrowserHarness$' -count=1 -v",
		);
	}
	await verifyBrowser(config);
}
