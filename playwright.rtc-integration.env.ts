/** Go試験から渡される実行環境。読み込み時には検証せず、エディターからの一覧取得を許可する。 */
export const rtcIntegrationEnv = {
	chromiumBinary: process.env.SINCRO_RTC_INTEGRATION_CHROMIUM_BINARY,
	baseURL: process.env.SINCRO_RTC_INTEGRATION_BASE_URL,
	audioFixture: process.env.SINCRO_RTC_INTEGRATION_AUDIO_FIXTURE,
};

/**
 * PlaywrightのglobalSetupとして実行し、ブラウザー起動前に必須入力を検査する。
 * 一覧取得では呼ばれない。実行ファイルや固定音声の詳細な検査とサービス起動はGo側が所有する。
 */
export default function validateRtcIntegrationEnvironment(): void {
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
}
