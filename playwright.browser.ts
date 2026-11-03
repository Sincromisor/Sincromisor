import { chromium, type FullConfig } from "@playwright/test";

// OS側で更新するChromeを使い、起動に失敗してもサンドボックスを無効化しない。
export const browserTestUse = {
	channel: "chrome",
	launchOptions: { chromiumSandbox: true },
};

// 2026-10-29のChromeセキュリティ更新を下限とする。最新版の追従は別途必要。
// https://chromereleases.googleblog.com/2026/10/stable-channel-update-for-desktop_02107719452.html
const minimumBrowserVersion = "156.0.8078.79";

/**
 * 各プロジェクトの実行ファイルを空のブラウザーで検査し、古い版や保護なしの起動を拒否する。
 * RTCの実行ファイル指定も検査対象とし、ページを開く前に終了する。検査用プロセスは必ず閉じる。
 */
export default async function verifyBrowser(config: FullConfig): Promise<void> {
	for (const project of config.projects) {
		const { channel, launchOptions } = project.use;
		if (
			launchOptions?.chromiumSandbox !== true ||
			launchOptions.args?.includes("--no-sandbox")
		) {
			throw new Error(
				"Browser tests require chromiumSandbox: true without --no-sandbox.",
			);
		}
		const browser = await chromium.launch({
			...launchOptions,
			channel,
			headless: true,
		});
		try {
			const version = browser.version();
			if (
				!/^\d+\.\d+\.\d+\.\d+$/.test(version) ||
				version.localeCompare(minimumBrowserVersion, "en", { numeric: true }) <
					0
			) {
				throw new Error(
					`Browser ${version} is unsupported. Update Chrome to ${minimumBrowserVersion} or later.`,
				);
			}
		} finally {
			await browser.close();
		}
	}
}
