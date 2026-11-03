import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "@playwright/test";
import verifyBrowser, { browserTestUse } from "../../playwright.browser.ts";

for (const [version, accepted] of [
	["156.0.8078.79", true],
	["156.0.8078.100", true],
	["157.0.8103.1", true],
	["156.0.8078.73", false],
	["156.0.8078.4", false],
	["155.0.8059.12", false],
	["140.0.7339.186", false],
	["unknown", false],
]) {
	test(`ブラウザー ${version} を${accepted ? "許可" : "拒否"}し検査用プロセスを閉じる`, async (t) => {
		let closed = false;
		const launch = t.mock.method(chromium, "launch", async () => ({
			version: () => version,
			close: async () => {
				closed = true;
			},
		}));
		const use = {
			...browserTestUse,
			launchOptions: {
				...browserTestUse.launchOptions,
				executablePath: "/test/chrome",
			},
		};
		const result = verifyBrowser({ projects: [{ use }] });
		if (accepted) await result;
		else await assert.rejects(result, /Update Chrome/);
		assert.equal(closed, true);
		assert.deepEqual(launch.mock.calls[0].arguments[0], {
			...use.launchOptions,
			channel: "chrome",
			headless: true,
		});
	});
}

for (const launchOptions of [
	undefined,
	{ chromiumSandbox: false },
	{
		chromiumSandbox: true,
		args: ["--no-sandbox"],
	},
]) {
	test(`保護設定 ${JSON.stringify(launchOptions)} では起動しない`, async (t) => {
		const launch = t.mock.method(chromium, "launch");
		await assert.rejects(
			verifyBrowser({ projects: [{ use: { launchOptions } }] }),
			/chromiumSandbox/,
		);
		assert.equal(launch.mock.callCount(), 0);
	});
}
