// OS側で更新するChromeを使い、起動に失敗してもサンドボックスを無効化しない。
export const browserTestUse = {
	channel: "chrome",
	launchOptions: { chromiumSandbox: true },
};
